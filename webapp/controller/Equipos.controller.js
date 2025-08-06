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
			const oBindingParams = oEvent.getParameter("bindingParams");
		
			const aSmartFilters = oBindingParams.filters || [];
		
			function fixFilterFecha(oFilter) {
				try {
					if (oFilter.sPath.indexOf("Desde") >= 0 || oFilter.sPath.indexOf("Hasta") >= 0) {
						if (oFilter.sOperator === "LE") {
							oFilter.oValue1.setMinutes(oFilter.oValue1.getMinutes() - oFilter.oValue1.getTimezoneOffset());
						} else {
							oFilter.oValue1.setMinutes(oFilter.oValue1.getMinutes() + oFilter.oValue1.getTimezoneOffset());
							oFilter.oValue2.setMinutes(oFilter.oValue2.getMinutes() - oFilter.oValue2.getTimezoneOffset());
						}
					}
				} catch (e) {}
			}
		
			function fixLoop(aFilters) {
				for (const i of aFilters) {
					if (i.aFilters && i.aFilters.length > 0) {
						fixLoop(i.aFilters);
					} else {
						fixFilterFecha(i);
					}
				}
			}
		
			fixLoop(aSmartFilters);
		
			const aCustomFilters = this._getFilters?.() || [];
		
			// Clonar filtros sin duplicar "Tipoequipo"
			const aFinalFilters = [...aSmartFilters];
		
			const hasTipoEquipoFilter = [...aSmartFilters, ...aCustomFilters].some(f =>
				(f.sPath === "Tipoequipo") ||
				(f.aFilters && f.aFilters.some(sub => sub.sPath === "Tipoequipo"))
			);
		
			if (!hasTipoEquipoFilter) {
				const aDefaultTipoEquipo = ["L6", "L5", "L4", "L3", "L2", "L1"];
				const oTipoEquipoFilter = new sap.ui.model.Filter({
					filters: aDefaultTipoEquipo.map(s =>
						new sap.ui.model.Filter("Tipoequipo", sap.ui.model.FilterOperator.EQ, s)
					),
					and: false
				});
				aFinalFilters.push(oTipoEquipoFilter);
			}
		
			// Agregar custom filters que no están duplicados
			for (const oFilter of aCustomFilters) {
				const isDuplicate = aFinalFilters.some(existing =>
					(existing.sPath === oFilter.sPath) ||
					(existing.aFilters && existing.aFilters.some(sub => sub.sPath === oFilter.sPath))
				);
				if (!isDuplicate) {
					aFinalFilters.push(oFilter);
				}
			}
		
			const sEmpresa = this.getView().getModel("viewModel").getProperty("/sociedad");
			if (sEmpresa) {
				aFinalFilters.push(new sap.ui.model.Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));
			}
		
			oBindingParams.filters = aFinalFilters;
		
			console.log("Filtros finales aplicados:", aFinalFilters);
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
			this._applyCustomFilters(oEvent, []); // Sin filtros por defecto
		},
		
		onBeforeRebindConexiones: function (oEvent) {
			this._applyCustomFilters(oEvent, ["P5", "P4", "P3", "P2", "P1"]);
		},
		

		_applyCustomFilters: function (oEvent, aDefaultTipoEquipo) {
			const oBindingParams = oEvent.getParameter("bindingParams");
			const aSmartFilters = oBindingParams.filters || [];
		
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
				for (const i of aFilters) {
					if (i.aFilters && i.aFilters.length > 0) {
						fixLoop(i.aFilters);
					} else {
						fixFilterFecha(i);
					}
				}
			}
		
			fixLoop(aSmartFilters);
		
			const aCustomFilters = this._getFilters?.() || [];
		
			
			const aFinalFilters = [...aSmartFilters];

			const hasTipoEquipoFilter = [...aSmartFilters, ...aCustomFilters].some(f =>
				f?.sPath === "Tipoequipo" ||
				(f.aFilters && f.aFilters.some(sub => sub.sPath === "Tipoequipo"))
			);
		
		
			if (!hasTipoEquipoFilter && aDefaultTipoEquipo.length > 0) {
				const oTipoEquipoFilter = new sap.ui.model.Filter({
					filters: aDefaultTipoEquipo.map(s =>
						new sap.ui.model.Filter("Tipoequipo", sap.ui.model.FilterOperator.EQ, s)
					),
					and: false
				});
				aFinalFilters.push(oTipoEquipoFilter);
			} 

				for (const oFilter of aCustomFilters) {
					const isDuplicate = aFinalFilters.some(existing =>
						existing.sPath === oFilter.sPath ||
						(existing.aFilters && existing.aFilters.some(sub => sub.sPath === oFilter.sPath))
					);
					if (!isDuplicate) {
						aFinalFilters.push(oFilter);
					}
				}
			
		
			const sEmpresa = this.getView().getModel("viewModel").getProperty("/sociedad");
			if (sEmpresa) {
				aFinalFilters.push(new sap.ui.model.Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));
			}
		
			oBindingParams.filters = aFinalFilters;
		
			console.log("Filtros aplicados:", aFinalFilters);
		},
		




		onEditarEquipo: function (oEvent) {
			var oData = oEvent.getSource().getBindingContext().getObject(),
				oView = this.getView();

			// //formatear campo regulado
			// oData.Regulado === 'R' ? oData.Regulado = true : oData.Regulado = false;

			//formatear campo remuneracion
			oData.Remuneracion === 'X' ? oData.Remuneracion = true : oData.Remuneracion = false;

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
					//filtro region penalidades por empresa seleccionada
					var sEmpresa = this.getModel("viewModel").getProperty("/sociedad");
					let aFilters = [];
					aFilters.push(new Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));
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
			//get custom filters
			var aFilters = [];

			var oSmartFilterBar = this.getView().byId("idSmartFilterBar");

			var aTipoequipo = oSmartFilterBar.getControlByKey("Tipoequipo").getSelectedKeys(),
				aRegionpenalidades = oSmartFilterBar.getControlByKey("Regionpenalidades").getSelectedKeys(),
				bRemuneracion = oSmartFilterBar.getControlByKey("Remuneracion").getSelected(),
				dFecha = oSmartFilterBar.getControlByKey("FechaCustom").getDateValue();

			//Tipo equipo
			var aTipoequipoFilter = [];
			for (var key of aTipoequipo) {
				aTipoequipoFilter.push(new Filter("Tipoequipo", sap.ui.model.FilterOperator.EQ, key))
			}
			if (aTipoequipoFilter.length > 0) {
				aFilters.push(new Filter({
					filters: aTipoequipoFilter,
					and: false,
				}));
			}

			if (aRegionpenalidades.length === 1) {
				// Solo un filtro, no necesita ser un MultiFilter
				aFilters.push(
					new Filter("Regionpenalidades", FilterOperator.EQ, aRegionpenalidades[0])
				);
			} else if (aRegionpenalidades.length > 1) {
				// Varios filtros, agrupamos con OR
				const aRegionFilters = aRegionpenalidades.map(key =>
					new Filter("Regionpenalidades", FilterOperator.EQ, key)
				);
			
				const oRegionOrFilter = new Filter({
					filters: aRegionFilters,
					and: false
				});
			
				aFilters.push(oRegionOrFilter);
			}
			
		

			//Empresa
			var sEmpresa = this.getModel("viewModel").getProperty("/sociedad");
			if (sEmpresa) aFilters.push(new Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));

			if (dFecha) {
				aFilters.push(new Filter("Desde", sap.ui.model.FilterOperator.LE, dFecha))
				aFilters.push(new Filter("Hasta", sap.ui.model.FilterOperator.GE, dFecha))
			}

			if (bRemuneracion) aFilters.push(new Filter("Remuneracion", sap.ui.model.FilterOperator.EQ, "X"));

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
		onEvolucionEquipo: function () {
			const oEditModelData = this._oDialogEdit.getModel("editModel").getData();
			const sCodigoEquipo = oEditModelData.Codigoequipo;

			console.log("Código de equipo:", sCodigoEquipo);

			const oModel = this.getView().getModel();
			oModel.setUseBatch(false);


			const oFilter = new sap.ui.model.Filter("CODIGOEQUIPO", sap.ui.model.FilterOperator.EQ, sCodigoEquipo);

			oModel.read("/HistoricoEquipoSet", {
				filters: [oFilter],
				success: (oData) => {
					if (oData.results && oData.results.length > 0) {

						ModelHelper.getModel(this.getView(), "historicoEquipoModel").setData(oData.results)

						if (!this._oHistoricoDialog) {
							this._oHistoricoDialog = sap.ui.xmlfragment("Transener.Operaciones.EquiposPenalidades.view.Fragments.EvolucionEquipo", this);
							this.getView().addDependent(this._oHistoricoDialog);
						}
						this._oHistoricoDialog.open();
					}
					else {
						sap.m.MessageBox.information("No hay datos de evolución para el equipo seleccionado.");
					}
				},
				error: (oError) => {
					console.error("Error al leer HistoricoEquipo", oError);
					sap.m.MessageToast.show("Error al cargar histórico");
				}
			});
		}, onVerDetalleHistorico: function (oEvent) {
			const oItem = oEvent.getSource().getParent(); // ColumnListItem
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
		}
		,
	});
});