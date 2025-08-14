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
			this._applyCustomFilters(oEvent, ["RT", "RL", "RB"]);
		},

		onBeforeRebindAutomatismos: function (oEvent) {
			//this._applyCustomFilters(oEvent, []); // Sin filtros por defecto
		},

		onBeforeRebindConexiones: function (oEvent) {
			this._applyCustomFilters(oEvent, ["P5", "P4", "P3", "P2", "P1"]);
		},

		_applyCustomFilters: function (oEvent, aDefaultTipoEquipo) {
			const oBindingParams = oEvent.getParameter("bindingParams");
			const aSmartFilters = oBindingParams.filters || [];

			// Corrige las fechas de los filtros
			function fixFilterFecha(oFilter) {
				try {
					if (oFilter.sPath?.includes("Desde") || oFilter.sPath?.includes("Hasta")) {
						if (oFilter.sOperator === "LE") {
							oFilter.oValue1.setMinutes(oFilter.oValue1.getMinutes() - oFilter.oValue1.getTimezoneOffset());
						} else {
							oFilter.oValue1.setMinutes(oFilter.oValue1.getMinutes() + oFilter.oValue1.getTimezoneOffset());
							oFilter.oValue2?.setMinutes(oFilter.oValue2.getMinutes() - oFilter.oValue2.getTimezoneOffset());
						}
					}
				} catch (e) {
					console.error("Error ajustando fechas:", e);
				}
			}

			function fixLoop(aFilters) {
				for (const filter of aFilters) {
					if (filter.aFilters && filter.aFilters.length > 0) {
						fixLoop(filter.aFilters);
					} else {
						fixFilterFecha(filter);
					}
				}
			}

			function isSameFilterPath(f1, f2) {
				if (f1.sPath && f2.sPath) {
					return f1.sPath === f2.sPath;
				}
				if (f1.aFilters && f2.aFilters) {
					const aPaths1 = f1.aFilters.map(f => f.sPath).sort();
					const aPaths2 = f2.aFilters.map(f => f.sPath).sort();
					return JSON.stringify(aPaths1) === JSON.stringify(aPaths2);
				}
				return false;
			}

			fixLoop(aSmartFilters);

			const aCustomFilters = this._getFilters?.() || [];
			const aFinalFilters = [...aSmartFilters];

			// Verifica si ya existe el filtro de Tipoequipo
			const hasTipoEquipoFilter = [...aSmartFilters, ...aCustomFilters].some(f =>
				f?.sPath === "Tipoequipo" ||
				(f.aFilters && f.aFilters.some(sub => sub.sPath === "Tipoequipo"))
			);

			// Si no existe, usar los valores por defecto
			if (!hasTipoEquipoFilter && Array.isArray(aDefaultTipoEquipo) && aDefaultTipoEquipo.length > 0) {
				const oTipoEquipoFilter = new sap.ui.model.Filter({
					filters: aDefaultTipoEquipo.map(s =>
						new sap.ui.model.Filter("Tipoequipo", sap.ui.model.FilterOperator.EQ, s)
					),
					and: false
				});
				aFinalFilters.push(oTipoEquipoFilter);
			}

			// Agregar filtros personalizados si no son duplicados
			for (const oFilter of aCustomFilters) {
				const isDuplicate = aFinalFilters.some(existing => isSameFilterPath(existing, oFilter));
				if (!isDuplicate) {
					aFinalFilters.push(oFilter);
				}
			}

			// Filtro empresa si no está ya
			const sEmpresa = this.getView().getModel("viewModel")?.getProperty("/sociedad");
			const alreadyHasEmpresa = aFinalFilters.some(f => f?.sPath === "Empresa");
			if (sEmpresa && !alreadyHasEmpresa) {
				aFinalFilters.push(new sap.ui.model.Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));
			}

			oBindingParams.filters = aFinalFilters;

		},

		onEditarEquipo: async function (oEvent) {
			var oData = oEvent.getSource().getBindingContext().getObject(),
				oView = this.getView();
		
			try {
				const Historico = await this.onEvolucionEquipo(oData.Codigoequipo);
		
				if (!Historico || Historico.length === 0) {
					ModelHelper.getModel(this.getView(), "evoModel").setProperty("/enabled", false);
				} else {
					ModelHelper.getModel(this.getView(), "evoModel").setProperty("/enabled", true);
				}
			} catch (error) {
				console.error("Error al obtener el histórico:", error);
				ModelHelper.getModel(this.getView(), "evoModel").setProperty("/enabled", false);
			}
		
			// Formatear campo remuneracion
			oData.Remuneracion = oData.Remuneracion === 'X';
			oData.Penaliza = oData.Penaliza === 'X';
		
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
		
					// Filtro de region penalidades por empresa seleccionada
					var sEmpresa = this.getModel("viewModel").getProperty("/sociedad");
					let aFilters = [
						new Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa)
					];
					this.getView().byId("selectPenalidades").getBinding("items").filter(aFilters);
					this.getView().byId("selectTension").getBinding("items").filter(aFilters);
					this.getView().byId("selectNemo").getBinding("items").filter(aFilters);
				}.bind(this));
		
				this._oDialogEdit.open();
			}.bind(this));
		}
		,

		onCancelarEditar: function () {
			this._oDialogEdit.close();
		},

		onGuardarEquipo: function () {
			var oData = this._oDialogEdit.getModel("editModel").getData(),
				sPath = this.getModel().createKey("/EquiposPenalidadesSet", {
					Empresa: oData.Empresa,
					Codigoequipo: oData.Codigoequipo,
					Desde: oData.Desde
				});

			// //formateo campo regulado	
			// oData.Regulado ? oData.Regulado = 'R' : oData.Regulado = 'N';

			//formateo campo remuneracion	
			oData.Remuneracion ? oData.Remuneracion = 'X' : oData.Remuneracion = '';
			oData.Penaliza ? oData.Penaliza = 'X' : oData.Penaliza = '';

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
		},

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

		onLimpiarFiltros: function (oEvt) {
			// this.getView().getModel("filters").setData([])
			var oSmartFilterBar = this.getView().byId("idSmartFilterBar");

			oSmartFilterBar.getControlByKey("Tipoequipo").setSelectedKeys([]);
			oSmartFilterBar.getControlByKey("Regionpenalidades").setSelectedKeys([]);
			oSmartFilterBar.getControlByKey("Desde").setDateValue(null);
			oSmartFilterBar.getControlByKey("Hasta").setDateValue(null);

			this.getView().byId("idSmartTable").rebindTable();

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
			const dFecha = oSmartFilterBar.getControlByKey("FechaCustom")?.getDateValue();
			if (dFecha) {
				aFilters.push(new sap.ui.model.Filter("Desde", sap.ui.model.FilterOperator.LE, dFecha));
				aFilters.push(new sap.ui.model.Filter("Hasta", sap.ui.model.FilterOperator.GE, dFecha));
			}

			// Filtro Remuneración
			const bRemuneracion = oSmartFilterBar.getControlByKey("Remuneracion")?.getSelected();
			if (bRemuneracion) {
				aFilters.push(new sap.ui.model.Filter("Remuneracion", sap.ui.model.FilterOperator.EQ, "X"));
			}

			return aFilters;
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