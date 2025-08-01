sap.ui.define([
	"./BaseController",
	"../model/formatter",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Fragment",
	"sap/m/MessageBox"
], function (BaseController, formatter, Filter, FilterOperator, JSONModel, Fragment, MessageBox) {
	"use strict";

	return BaseController.extend("Transener.Operaciones.EquiposPenalidades.controller.Equipos", {
		formatter: formatter,
		
		//------------------------------ Metodos Ciclo de vida -------------------------------------
		onInit: function () {
			this.getView().setModel(new JSONModel({
				sizeDetail: "0%",
				sociedad: ""
			}), "viewModel");
			
			var oFilter = this.getView().byId("idSmartFilterBar"),
				that = this;
				
			// oFilter.addEventDelegate({
			// 	"onAfterRendering": function(oEvent) {
			// 		var oResourceBundle = that.getOwnerComponent().getModel("i18n").getResourceBundle();
			// 		var oButton = oEvent.srcControl._oSearchButton;
			// 		oButton.setText(oResourceBundle.getText("goButton"));
			// 		oButton.setIcon("sap-icon://filter");
			// 		}
			// });
		},
		
		onAfterRendering: function(){
			this._loadSociety();
		},
		
		//------------------------------ Metodos Públicos ------------------------------------------
		onBeforeRebindTable: function(oEvent){
			var binding = oEvent.getParameter("bindingParams");
			
			//corregir fecha cuando se elige un valor individual
            function fixFilterFecha(oFilter) {
                try {
                    if (oFilter.sPath.indexOf("Desde") >= 0 || oFilter.sPath.indexOf("Hasta") >= 0) {
                        if (oFilter.sOperator === "LE") {
                            // Hasta - solo value1 como maximo
                            oFilter.oValue1.setMinutes(oFilter.oValue1.getMinutes() - oFilter.oValue1.getTimezoneOffset());
                        } else {
                            oFilter.oValue1.setMinutes(oFilter.oValue1.getMinutes() + oFilter.oValue1.getTimezoneOffset());
                            oFilter.oValue2.setMinutes(oFilter.oValue2.getMinutes() - oFilter.oValue2.getTimezoneOffset());
                        }
                    }
                } catch (e) { }
            }

            function fixLoop(aFilters) {
                for (var i of aFilters) {
                    if (i.aFilters && i.aFilters.length > 0) {
                        fixLoop(i.aFilters);
                    } else {
                        fixFilterFecha(i);
                    }
                }
            }

            fixLoop(binding.filters);

			//get custom filters
			var aFilters = this._getFilters();

			binding.filters = binding.filters.concat(aFilters);
		},
		onBeforeRebindLineas: function (oEvent) {
			const oBindingParams = oEvent.getParameter("bindingParams");
		
			// Clonar y corregir los filtros del SmartFilterBar
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
		
			// Obtener filtros personalizados (por ejemplo, desde _getFilters)
			const aCustomFilters = this._getFilters?.() || [];
		
			// Buscar si ya hay filtros para Tipoequipo
			const hasTipoEquipoFilter = aCustomFilters.some(f =>
				(f.sPath === "Tipoequipo") ||
				(f.aFilters && f.aFilters.some(sub => sub.sPath === "Tipoequipo"))
			);
		
			// Si no hay filtros para Tipoequipo, aplicar los predeterminados L5 a L1
			const aFinalFilters = [...aSmartFilters]; // incluir filtros del SmartFilterBar
		
			if (!hasTipoEquipoFilter) {
				const aDefaultTipoEquipo = ["L1", "L2", "L3", "L4", "L5"];
				const oTipoEquipoFilter = new sap.ui.model.Filter({
					filters: aDefaultTipoEquipo.map(s =>
						new sap.ui.model.Filter("Tipoequipo", sap.ui.model.FilterOperator.EQ, s)
					),
					and: false
				});
				aFinalFilters.push(oTipoEquipoFilter);
			} else {
				// Si hay filtro de Tipoequipo en _getFilters, agregarlos todos
				aFinalFilters.push(...aCustomFilters);
			}
		
			// Filtro por Empresa desde el viewModel
			const sEmpresa = this.getView().getModel("viewModel").getProperty("/sociedad");
			if (sEmpresa) {
				aFinalFilters.push(new sap.ui.model.Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));
			}
		
			// Asignar todos los filtros al binding
			oBindingParams.filters = aFinalFilters;
		
			console.log("Filtros finales aplicados:", oBindingParams.filters);
		},
		
		
		
		
		onEditarEquipo: function(oEvent){
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
		
		onGuardarEquipo: function(){
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
				success: function(){
					MessageBox.success(this.getResourceBundle().getText("ed_msg_exito"));
					this._oDialogEdit.setBusy(false);
					this._oDialogEdit.close();
				}.bind(this),
				error: function(){
					MessageBox.error(this.getResourceBundle().getText("ed_msg_error"));
					this._oDialogEdit.setBusy(false);
				}.bind(this)
			});
		},
		
		onVerDetalle: function(oEvent){
			// var oContext = oEvent.getSource().getBindingContext(), //responsive table 
			var oContext = oEvent.getParameter("rowBindingContext");//grid table
			
			if(oContext){
				var sPath = oContext.getPath();
				this.getView().byId("boxDetalle").bindObject(sPath);
				this.getView().getModel("viewModel").setProperty("/sizeDetail", "30%");	
			} else {
				this.getView().getModel("viewModel").setProperty("/sizeDetail", "0%");	
			}
		},
		
		onOcultarDetalle: function(){
			this.getView().getModel("viewModel").setProperty("/sizeDetail", "0%");
		},
		
		onGuardarEmpresa: function(){
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
		_getFilters: function(){
			//get custom filters
			var aFilters = [];

			var oSmartFilterBar = this.getView().byId("idSmartFilterBar");

			var aTipoequipo = oSmartFilterBar.getControlByKey("Tipoequipo").getSelectedKeys(),
				aRegionpenalidades = oSmartFilterBar.getControlByKey("Regionpenalidades").getSelectedKeys(),
				bRemuneracion= oSmartFilterBar.getControlByKey("Remuneracion").getSelected(),
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
			
			//Region penalidades
			var aRegionpenalidadesFilter = [];
			for (var key of aRegionpenalidades) {
				aRegionpenalidadesFilter.push(new Filter("Regionpenalidades", sap.ui.model.FilterOperator.EQ, key))
			}
			if (aRegionpenalidadesFilter.length > 0) {
				aFilters.push(new Filter({
					filters: aRegionpenalidadesFilter,
					and: false,
				}));
			}
			
			//Empresa
			var sEmpresa = this.getModel("viewModel").getProperty("/sociedad");
			if(sEmpresa) aFilters.push(new Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));
			
			if(dFecha) {
				aFilters.push(new Filter("Desde", sap.ui.model.FilterOperator.LE, dFecha))
				aFilters.push(new Filter("Hasta", sap.ui.model.FilterOperator.GE, dFecha))
			}
			
			if(bRemuneracion) aFilters.push(new Filter("Remuneracion", sap.ui.model.FilterOperator.EQ, "X"));
			
			return aFilters;
		},
		
		_loadSociety: function () {
			this.getModel("Operaciones").read("/EmpresaUsuarioSet", {
				success: function (data) {
					var empresa = data.results[0].Empresa;
					if (empresa === "999") {
						this._initSociety();
					} else {
						this.getModel("viewModel").setProperty("/sociedad",empresa);
						this._afterSelectEmpresa();
					}
				}.bind(this),
				error: function (err) {
					MessageToast.show("Error:" + err);
				}.bind(this)
			});
		},
		
		_initSociety: function(){
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
		
		_afterSelectEmpresa: function(){
			var sEmpresa = this.getModel("viewModel").getProperty("/sociedad"),
				oSmartFilterBar = this.getView().byId("idSmartFilterBar");
			this.getView().byId("idSmartTable").rebindTable();
			let aFilters = [];
            aFilters.push(new Filter("Empresa", sap.ui.model.FilterOperator.EQ, sEmpresa));
            oSmartFilterBar.getControlByKey("Regionpenalidades").getBinding("items").filter(aFilters);
            oSmartFilterBar.getControlByKey("Tipoequipo").getBinding("items").filter(aFilters);
		}
	});
});