sap.ui.define([
	"./BaseController",
	"../model/formatter",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Fragment",
	"sap/m/MessageBox",
	"Transener/Operaciones/EquiposPenalidades/utils/ModelHelper"
], function (BaseController, formatter, Filter, FilterOperator, JSONModel, Fragment, MessageBox, ModelHelper) {
	"use strict";

	return BaseController.extend("Transener.Operaciones.EquiposPenalidades.controller.Equipos", {
		formatter: formatter,

		//------------------------------ Metodos Ciclo de vida -------------------------------------
		onInit: function () {
			this.getView().setModel(new JSONModel({
				sizeDetail: "0%",
				sociedad: ""
			}), "viewModel");

			this.getVersion()


		}, getVersion: function () {
			const oComponent = this.getOwnerComponent();



			let jsonModel = sap.ui.getCore().getModel("appCurrentInfo");

			if (!jsonModel) {
				jsonModel = new sap.ui.model.json.JSONModel();
				jsonModel.setSizeLimit(9999);

				const sVersion = oComponent.getManifestEntry("/sap.app/applicationVersion/version");

				jsonModel.setData({

					version: sVersion
				});

				sap.ui.getCore().setModel(jsonModel, "appCurrentInfo");
				this.getView().setModel(jsonModel, "appCurrentInfo")
			}
		},

		onAfterRendering: function () {
			this._loadSociety();
		},

		onBeforeRebindLineas: function (oEvent) {
			this._applyCustomFilters(oEvent, ["L6", "L5", "L4", "L3", "L2", "L1"]);
		},
		onBeforeRebindTransformadores: function (oEvent) {
			this._applyCustomFilters(oEvent, ["TR", "AU"]);
		},

		onBeforeRebindReactores: function (oEvent) {
			this._applyCustomFilters(oEvent, ["RB", "KS", "KP", "RT", "RL", "CS", "RG"]);
		},

		onBeforeRebindAutomatismos: function (oEvent) {
			const m = oEvent.getParameter("bindingParams");
			m.parameters = m.parameters || {};

			// Quitar cualquier filtro que venga del SmartFilterBar o p13n
			m.filters = [];

			// Asegurar que no quede nada en la URL
			delete m.parameters.$filter; // OData V2
			delete m.parameters.$apply;  // por si hubiera agregaciones

			// (Opcional) forzar sólo ciertos campos o expansiones
			// m.parameters.$select = "Empresa,Codigoequipo,Descripcion,Desde,Hasta,Nemo,IdBde,IdPagoTran";
			// m.parameters.$expand = "";
		}
		,

		onBeforeRebindConexiones: function (oEvent) {
			this._applyCustomFilters(oEvent, ["P5", "P4", "P3", "P2", "P1"]);
		},

		_applyCustomFilters: function (oEvent, aDefaultTipoEquipo) {
			const oBindingParams = oEvent.getParameter("bindingParams");
			const aSmartFilters = oBindingParams.filters || [];
			const Filter = sap.ui.model.Filter;
			const FilterOperator = sap.ui.model.FilterOperator;

			// ===== helpers =====
			function fixFilterFecha(oFilter) {
				try {
					if (oFilter.sPath?.includes("Desde") || oFilter.sPath?.includes("Hasta")) {
						// LE = single value (<=)
						if (oFilter.sOperator === "LE") {
							oFilter.oValue1.setMinutes(oFilter.oValue1.getMinutes() - oFilter.oValue1.getTimezoneOffset());
						} else {
							// Between / GE / BT: ajustar ambos extremos
							oFilter.oValue1?.setMinutes(oFilter.oValue1.getMinutes() + oFilter.oValue1.getTimezoneOffset());
							oFilter.oValue2?.setMinutes(oFilter.oValue2.getMinutes() - oFilter.oValue2.getTimezoneOffset());
						}
					}
				} catch (e) {
					console.error("Error ajustando fechas:", e);
				}
			}

			function walkFixDates(aFilters) {
				for (const f of aFilters) {
					if (f.aFilters && f.aFilters.length) {
						walkFixDates(f.aFilters);
					} else {
						fixFilterFecha(f);
					}
				}
			}

			// Serializa un filtro para detectar duplicados
			function serializeFilter(f) {
				if (f.aFilters && f.aFilters.length) {
					// grupo
					const children = f.aFilters.map(serializeFilter).sort();
					return JSON.stringify({ group: true, and: !!f.bAnd, children });
				}
				return JSON.stringify({
					path: f.sPath || null,
					op: f.sOperator || null,
					v1: f.oValue1 instanceof Date ? f.oValue1.toISOString() : f.oValue1,
					v2: f.oValue2 instanceof Date ? f.oValue2.toISOString() : f.oValue2
				});
			}

			function pushIfNotDuplicate(arr, f) {
				const sig = serializeFilter(f);
				if (!arr._sigs) arr._sigs = new Set(arr.map(serializeFilter));
				if (!arr._sigs.has(sig)) {
					arr.push(f);
					arr._sigs.add(sig);
				}
			}

			// ===== 1) Fix fechas sobre los filtros del SFB =====
			walkFixDates(aSmartFilters);

			// ===== 2) Traer custom filters existentes (si los tenés) =====
			const aCustomFilters = this._getFilters?.() || [];

			// ===== 3) Construir filtros "IdBDE" y "Elemento" desde el SmartFilterBar =====
			const oSFB = this.byId("idSmartFilterBar");
			if (oSFB) {
				// IdBDE -> contains sobre IdPagoTran
				const oIdBDE = oSFB.getControlByKey?.("IdBDE");
				const idBDEVal = oIdBDE?.getValue?.().trim();
				if (idBDEVal) {
					aCustomFilters.push(new Filter("IdPagoTran", FilterOperator.Contains, idBDEVal));
				}

				// Elemento -> MultiComboBox (OR)
				const oElem = oSFB.getControlByKey?.("Elemento");
				const selectedKeys = oElem?.getSelectedKeys?.() || [];
				if (selectedKeys.length) {
					aCustomFilters.push(
						new Filter(
							selectedKeys.map(k => new Filter("Elemento", FilterOperator.EQ, k)),
							false // OR
						)
					);
				}
			}

			// ===== 4) Ensamblar final con deduplicación =====
			const aFinalFilters = [];
			for (const f of aSmartFilters) pushIfNotDuplicate(aFinalFilters, f);
			for (const f of aCustomFilters) pushIfNotDuplicate(aFinalFilters, f);

			// ===== 5) Default Tipoequipo si no hay filtro para ese path =====
			const hasTipoEquipoFilter =
				aFinalFilters.some(f =>
					(f.sPath === "Tipoequipo") ||
					(f.aFilters && f.aFilters.some(sub => sub.sPath === "Tipoequipo"))
				);

			if (!hasTipoEquipoFilter && Array.isArray(aDefaultTipoEquipo) && aDefaultTipoEquipo.length) {
				const tipoEqOr = new Filter({
					filters: aDefaultTipoEquipo.map(s => new Filter("Tipoequipo", FilterOperator.EQ, s)),
					and: false
				});
				pushIfNotDuplicate(aFinalFilters, tipoEqOr);
			}

			// ===== 6) Filtro Empresa si no está =====
			const sEmpresa = this.getView().getModel("viewModel")?.getProperty("/sociedad");
			const alreadyHasEmpresa = aFinalFilters.some(f =>
				(f.sPath === "Empresa") || (f.aFilters && f.aFilters.some(sub => sub.sPath === "Empresa"))
			);
			if (sEmpresa && !alreadyHasEmpresa) {
				pushIfNotDuplicate(aFinalFilters, new Filter("Empresa", FilterOperator.EQ, sEmpresa));
			}

			// ===== 7) Devolver al binding =====
			oBindingParams.filters = aFinalFilters;
		},


		onEditarEquipo: async function (oEvent) {
			var oData = oEvent.getSource().getBindingContext().getObject(),
				oView = this.getView();

			try {
				const Historico = await this.onEvolucionEquipo(oData.Codigoequipo);
				ModelHelper.getModel(this.getView(), "evoModel")
					.setProperty("/enabled", !!(Historico && Historico.length));
			} catch (error) {
				console.error("Error al obtener el histórico:", error);
				ModelHelper.getModel(this.getView(), "evoModel").setProperty("/enabled", false);
			}

			// Flags a boolean
			oData.Remuneracion = oData.Remuneracion === "X";
			oData.Penaliza = oData.Penaliza === "X";
			oData.Flagperdidarem = oData.Flagperdidarem === "X";

			// ---- NUEVO: normalizar Regionpenalidades a selectedKeys ----
			const toSelectedKeys = (v) => {
				if (Array.isArray(v)) return v.map(String).map(s => s.toUpperCase().trim()).filter(Boolean);
				if (v == null) return [];
				// Reemplaza separadores comunes por espacios y corta por espacios
				return String(v)
					.toUpperCase()
					.replace(/[;,|]/g, " ")
					.split(/\s+/)
					.map(s => s.trim())
					.filter(Boolean);
			};
			// Ej: "M S" -> ["M","S"]
			oData.RegionpenalidadesKeys = toSelectedKeys(oData.Regionpenalidades);

			Fragment.load({
				name: "Transener.Operaciones.EquiposPenalidades.view.Fragments.EditarEquipo",
				id: oView.getId(),
				controller: this
			}).then(function (oPopup) {
				this._oDialogEdit = oPopup;
				this.getView().addDependent(oPopup);

				this._oDialogEdit.attachAfterClose(function (oEvent) {
					oEvent.getSource().destroy();
				});

				this._oDialogEdit.attachAfterOpen(function () {
					this._oDialogEdit.setModel(new JSONModel(oData), "editModel");

					// Filtros por empresa
					var sEmpresa = this.getModel("viewModel").getProperty("/sociedad");
					let aFilters = [new Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa)];
					this.getView().byId("selectPenalidades").getBinding("items").filter(aFilters);
					this.getView().byId("selectTension").getBinding("items").filter(aFilters);
					this.getView().byId("selectNemo").getBinding("items").filter(aFilters);

				}.bind(this));

				this._oDialogEdit.open();
			}.bind(this));
		},


		onCancelarEditar: function () {
			this._oDialogEdit.close();
		},

		// onGuardarEquipo: function () {
		// 	var oData = this._oDialogEdit.getModel("editModel").getData(),
		// 		sPath = this.getModel().createKey("/EquiposPenalidadesSet", {
		// 			Empresa: oData.Empresa,
		// 			Codigoequipo: oData.Codigoequipo,
		// 			Desde: oData.Desde
		// 		});
		// 	//delete oData.Premios // Hasta que este el campo en el backend eliminarlo

		// 	oData.Regionpenalidades = (oData.RegionpenalidadesKeys || []).join(" ");
		// 	oData.Remuneracion ? oData.Remuneracion = 'X' : oData.Remuneracion = '';
		// 	oData.Penaliza ? oData.Penaliza = 'X' : oData.Penaliza = '';
		// 	oData.Flagperdidarem ? oData.Flagperdidarem = "X" : oData.Flagperdidarem = "";

		// 	delete oData.RegionpenalidadesKeys

		// 	this._oDialogEdit.setBusy(true);
		// 	this.getModel().update(sPath, oData, {
		// 		success: function () {
		// 			MessageBox.success(this.getResourceBundle().getText("ed_msg_exito"));
		// 			this._oDialogEdit.setBusy(false);
		// 			this._oDialogEdit.close();
		// 		}.bind(this),
		// 		error: function () {
		// 			MessageBox.error(this.getResourceBundle().getText("ed_msg_error"));
		// 			this._oDialogEdit.setBusy(false);
		// 		}.bind(this)
		// 	});
		// },
		onGuardarEquipo: function () {
    var oData = this._oDialogEdit.getModel("editModel").getData(),
        sPath = this.getModel().createKey("/EquiposPenalidadesSet", {
            Empresa: oData.Empresa,
            Codigoequipo: oData.Codigoequipo,
            Desde: oData.Desde
        });

    // Normalizar campos antes del guardado
    oData.Regionpenalidades = (oData.RegionpenalidadesKeys || []).join(" ");
    oData.Remuneracion = oData.Remuneracion ? "X" : "";
    oData.Penaliza = oData.Penaliza ? "X" : "";
    oData.Flagperdidarem = oData.Flagperdidarem ? "X" : "";
    delete oData.RegionpenalidadesKeys;

    // === Popup para pedir fecha de modificación ===
    var oDatePicker = new sap.m.DatePicker({
        valueFormat: "yyyy-MM-dd",
        displayFormat: "dd.MM.yyyy",
        placeholder: "dd.mm.aaaa"
    });

    MessageBox.confirm("Ingrese la fecha de modificación:", {
        title: "Confirmar",
        icon: MessageBox.Icon.QUESTION,
        actions: ["Guardar", "Cancelar"],
        content: oDatePicker,  // agregamos el DatePicker al popup
        onClose: function (sAction) {
            if (sAction === "Guardar") {
                var sFecha = oDatePicker.getDateValue();
                if (sFecha) {
                    // Agregar la fecha al payload
                    oData.FechaModificacion = sFecha.toISOString().split("T")[0];
                }

                this._oDialogEdit.setBusy(true);
                this.getModel().update(sPath, oData, {
                    success: function () {
                        MessageBox.success(this.getResourceBundle().getText("ed_msg_exito"));
                        this._oDialogEdit.setBusy(false);
                        this._oDialogEdit.close();
                    }.bind(this),
                    error: function () {
                        MessageBox.error(this.getResourceBundle().getText("ed_msg_error"));
                        this._oDialogEdit.setBusy(false);
                    }.bind(this)
                });
            }
        }.bind(this)
    });
}
,

		onVerDetalle: function (oEvent) {
			// var oContext = oEvent.getSource().getBindingContext(), //responsive table 
			var oContext = oEvent.getParameter("rowBindingContext");//grid table

			if (oContext) {
				var sPath = oContext.getPath();
				this.getView().byId("boxDetalle").bindObject(sPath);
				this.getView().getModel("viewModel").setProperty("/sizeDetail", "30%");
			} else {
				this.getView().getModel("viewModel").setProperty("/sizeDetail", "0%");
			}
		},

		onOcultarDetalle: function () {
			this.getView().getModel("viewModel").setProperty("/sizeDetail", "0%");
		},

		onGuardarEmpresa: function () {
			var society = this.getModel("viewModel").getProperty("/sociedad");
			if (society) {
				this._oDialogEmpresas.close();
				this._afterSelectEmpresa();
			} else {
				MessageBox.information("Debe seleccionar una empresa!", {
					title: "Selección de Empresa"
				});
			}
		},

		onLimpiarFiltros: function () {
			const oSFB = this.getView().byId("idSmartFilterBar");
			const oView = this.getView()

			
			oSFB.getControlByKey("CodigoEquipo")?.setSelectedKeys([]);
			oSFB.getControlByKey("Tipoequipo")?.setSelectedKeys([]);
			oSFB.getControlByKey("Regionpenalidades")?.setSelectedKeys([]);

			
			oSFB.getControlByKey("FechaDesde")?.setDateValue(null);
			oSFB.getControlByKey("FechaHasta")?.setDateValue(null);

			
			const clearYesNoChecks = (sKey) => {
				const oContainer = oSFB.getControlByKey(sKey);
				if (!oContainer || !oContainer.findAggregatedObjects) return;
				const aChecks = oContainer.findAggregatedObjects(true, o => o.isA("sap.m.CheckBox"));
				aChecks.forEach(cb => cb.setSelected(false));
			};

			clearYesNoChecks("Remuneracion");
			clearYesNoChecks("Penaliza");
			clearYesNoChecks("Flagperdidarem");

			// refrescar la tabla
		oView.byId("LineasTable").rebindTable();
			oView.byId("TransformadoresTable").rebindTable();
			oView.byId("ReactoresTable").rebindTable();
			oView.byId("AutomatismosTable").rebindTable();
			oView.byId("ConexionesTable").rebindTable();
		},


		//------------------------------ Metodos Internos ------------------------------------------
		_getFilters: function () {
			const oSmartFilterBar = this.getView().byId("idSmartFilterBar");
			const aFilters = [];

			// Utilidad para múltiples claves
			function buildMultiFilter(sPath, aKeys) {
				if (!aKeys || aKeys.length === 0) return null;
				const aSubFilters = aKeys.map(key => new sap.ui.model.Filter(sPath, sap.ui.model.FilterOperator.EQ, key));
				return new sap.ui.model.Filter({ filters: aSubFilters, and: false });
			}

			// Filtros múltiples
			const aTipoequipo = oSmartFilterBar.getControlByKey("Tipoequipo")?.getSelectedKeys() || [];
			const oTipoequipoFilter = buildMultiFilter("Tipoequipo", aTipoequipo);
			if (oTipoequipoFilter) aFilters.push(oTipoequipoFilter);

			const aRegionpenalidades = oSmartFilterBar.getControlByKey("Regionpenalidades")?.getSelectedKeys() || [];
			const oRegionFilter = buildMultiFilter("Regionpenalidades", aRegionpenalidades);
			if (oRegionFilter) aFilters.push(oRegionFilter);

			// Filtro Empresa
			const sEmpresa = this.getModel("viewModel")?.getProperty("/sociedad");
			if (sEmpresa) aFilters.push(new sap.ui.model.Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));

			// Filtro Fecha
			const dFecha = oSmartFilterBar.getControlByKey("FechaDesde")?.getDateValue();
			if (dFecha) {
				aFilters.push(new sap.ui.model.Filter("Desde", sap.ui.model.FilterOperator.GE, dFecha));
			}
			const hFecha = oSmartFilterBar.getControlByKey("FechaHasta")?.getDateValue();
			if (hFecha) {
				aFilters.push(new sap.ui.model.Filter("Hasta", sap.ui.model.FilterOperator.LE, hFecha));
			}

			// Filtro Remuneración
			this.addYesNoFilterByKey(oSmartFilterBar, "Remuneracion", "Remuneracion", aFilters);
			this.addYesNoFilterByKey(oSmartFilterBar, "Penaliza", "Penaliza", aFilters);
			this.addYesNoFilterByKey(oSmartFilterBar, "Flagperdidarem", "Flagperdidarem", aFilters);

			return aFilters;
		},

		addYesNoFilterByKey: function (oSFB, sFieldKey, sProperty, aFilters) {
			const oContainer = oSFB.getControlByKey(sFieldKey); // <-- "Remuneracion", "Penaliza", etc.
			if (!oContainer) return;

			// Buscar los CheckBox dentro del HBox (o lo que tengas)
			const aChecks = oContainer.findAggregatedObjects(true, function (oChild) {
				return oChild.isA("sap.m.CheckBox");
			});

			if (!aChecks || aChecks.length < 2) return;

			// Intentá reconocerlos por id o por texto
			const getBy = (pred) => aChecks.find(pred);
			const oYes = getBy(cb => cb.getId().endsWith("chkRemuYes") || cb.getText() === "Sí") || aChecks[0];
			const oNo = getBy(cb => cb.getId().endsWith("chkRemuNo") || cb.getText() === "No") || aChecks[1];

			const bYes = oYes?.getSelected();
			const bNo = oNo?.getSelected();

			// Ambos seleccionados => no filtrar
			if (bYes && bNo) return;

			if (bYes) {
				aFilters.push(new sap.ui.model.Filter(sProperty, sap.ui.model.FilterOperator.EQ, "X"));
			} else if (bNo) {
				// Ajustá si tu backend usa " " o "0" para "No"
				aFilters.push(new sap.ui.model.Filter(sProperty, sap.ui.model.FilterOperator.EQ, ""));
			}
		},


		_loadSociety: function () {
			this.getModel("Operaciones").read("/EmpresaUsuarioSet", {
				success: function (data) {
					var empresa = data.results[0].Empresa;
					if (empresa === "999") {
						this._initSociety();
					} else {
						this.getModel("viewModel").setProperty("/sociedad", empresa);
						this._afterSelectEmpresa();
					}
				}.bind(this),
				error: function (err) {
					MessageToast.show("Error:" + err);
				}.bind(this)
			});
		},
		_loadNemos: function () {

			const sEmpresa = ModelHelper.getModel(this.getView(), "viewModel").getProperty("/sociedad")
			let aFilters = [];

			aFilters.push(new Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));
			this.getModel("Operaciones").read("/NemoSet", {
				filters: aFilters,
				success: function (data) {
					ModelHelper.getModel(this.getOwnerComponent(), 'NemoSet').setData(data.results)
				}.bind(this),
				error: function (err) {
					MessageToast.show("Error:" + err);
				}.bind(this)
			});
		},


		_initSociety: function () {
			Fragment.load({
				name: "Transener.Operaciones.EquiposPenalidades.view.Fragments.SeleccionarEmpresa",
				controller: this
			}).then(function (oPopup) {
				this._oDialogEmpresas = oPopup;
				this.getView().addDependent(oPopup);
				this._oDialogEmpresas.attachAfterClose(function (oEvent) {
					oEvent.getSource().destroy();
				});

				this._oDialogEmpresas.open();
			}.bind(this));
		},

		_afterSelectEmpresa: function () {

			const oView = this.getView()

			var sEmpresa = this.getModel("viewModel").getProperty("/sociedad"),
				oSmartFilterBar = this.getView().byId("idSmartFilterBar");

			oView.byId("LineasTable").rebindTable();
			oView.byId("TransformadoresTable").rebindTable();
			oView.byId("ReactoresTable").rebindTable();
			oView.byId("AutomatismosTable").rebindTable();
			oView.byId("ConexionesTable").rebindTable();

			let aFilters = [];

			aFilters.push(new Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));

			oSmartFilterBar.getControlByKey("Regionpenalidades").getBinding("items").filter(aFilters);

			oSmartFilterBar.getControlByKey("Tipoequipo").getBinding("items").filter(aFilters);
			this._loadNemos()

		},
		onEvolucionEquipo: async function (Codigoequipo) {
			let sCodigoEquipo = "";

			const bFromParam = typeof Codigoequipo === "string" && Codigoequipo.trim() !== "";

			if (bFromParam) {
				sCodigoEquipo = Codigoequipo;
			} else {
				const oEditModelData = this._oDialogEdit.getModel("editModel").getData();
				sCodigoEquipo = oEditModelData.Codigoequipo;
			}


			const oModel = this.getView().getModel();
			oModel.setUseBatch(false);

			const oFilter = new sap.ui.model.Filter("CODIGOEQUIPO", sap.ui.model.FilterOperator.EQ, sCodigoEquipo);

			return new Promise((resolve, reject) => {
				oModel.read("/HistoricoEquipoSet", {
					filters: [oFilter],
					success: (oData) => {
						if (oData.results && oData.results.length > 0) {
							ModelHelper.getModel(this.getView(), "historicoEquipoModel").setData(oData.results);

							if (bFromParam) {
								resolve(oData.results);
							} else {
								if (!this._oHistoricoDialog) {
									this._oHistoricoDialog = sap.ui.xmlfragment("Transener.Operaciones.EquiposPenalidades.view.Fragments.EvolucionEquipo", this);
									this.getView().addDependent(this._oHistoricoDialog);
								}
								this._oHistoricoDialog.open();
								resolve();
							}
						} else {
							if (bFromParam) {
								resolve([]);
							} else {
								sap.m.MessageToast.show("No se encontraron datos históricos.");
								resolve();
							}
						}
					},
					error: (oError) => {
						console.error("Error al leer HistoricoEquipo", oError);
						sap.m.MessageToast.show("Error al cargar histórico");
						reject(oError);
					}
				});
			});
		}
		,
		onVerDetalleHistorico: function (oEvent) {
			const oItem = oEvent.getSource().getParent();
			const oContext = oItem.getBindingContext("historicoEquipoModel");
			const oData = oContext.getObject();


			const oDetailModel = ModelHelper.getModel(this.getView(), "detalleHistoricoModel").setData(oData)


			if (!this._oDetalleHistoricoDialog) {
				sap.ui.core.Fragment.load({
					name: "Transener.Operaciones.EquiposPenalidades.view.Fragments.EvolucionDetalle",
					id: this.getView().getId(),
					controller: this
				}).then((oDialog) => {
					this._oDetalleHistoricoDialog = oDialog;
					this.getView().addDependent(oDialog);


					oDialog.setModel(oDetailModel, "detalleHistoricoModel");

					oDialog.open();
				});
			} else {

				this._oDetalleHistoricoDialog.setModel(oDetailModel, "detalleHistoricoModel");
				this._oDetalleHistoricoDialog.open();
			}
		},



		onOcultarDetalle: function () {
			this.getView().getModel("viewModel").setProperty("/sizeDetail", "0%");
		},
		onCloseDetalleHistoricoDialog: function () {
			this._oDetalleHistoricoDialog.close();
		},
		onCloseHistoricoDialog: function () {
			this._oHistoricoDialog.close();

		}
		,
	});
});