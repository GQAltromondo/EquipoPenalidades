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
		_isAutomSetName: function (sName) {
			return ((sName || "").toLowerCase().indexOf("/automatismos") === 0);
		},
		_normalizeAutomSetName: function (sName) {
			const base = (sName || "/AutomatismosSet").split("(")[0] || "/AutomatismosSet";
			const withSlash = base.startsWith("/") ? base : `/${base}`;
			if (/automatismosset$/i.test(withSlash)) { return withSlash; }
			if (/automatismos$/i.test(withSlash)) { return `${withSlash}Set`; }
			return withSlash;
		},

		//------------------------------ Metodos Ciclo de vida -------------------------------------
		onInit: function () {
			this.getView().setModel(new JSONModel({
				sizeDetail: "0%",
				sociedad: "",
				hasVencidos: false,
				_hasVencidosMap: {},
				showCoefVencidosOnly: false
			}), "viewModel");
			["LineasTable", "TransformadoresTable", "ReactoresTable", "ConexionesTable"]
				.forEach(id => this._wireHasVencidosMonitor(id));
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

			const sEmpresa = this.getView().getModel("viewModel")?.getProperty("/sociedad");
			if (sEmpresa) {
				m.filters.push(new Filter("Empresa", FilterOperator.EQ, sEmpresa));
			}

			// (Opcional) forzar sólo ciertos campos o expansiones
			// m.parameters.$select = "Empresa,Codigoequipo,Descripcion,Desde,Hasta,Nemo,IdBde,IdPagoTran";
			// m.parameters.$expand = "";
		}
		,

		onBeforeRebindConexiones: function (oEvent) {
			this._applyCustomFilters(oEvent, ["P5", "P4", "P3", "P2", "P1"]);
		},
		_todayYMD: function () {
			const d = new Date();
			const y = d.getFullYear();
			const m = String(d.getMonth() + 1).padStart(2, "0");
			const day = String(d.getDate()).padStart(2, "0");
			return `${y}${m}${day}`; // ajustá formato si tu backend espera otro
		},

		_applyCustomFilters: function (oEvent, aDefaultTipoEquipo) {
			const oBindingParams = oEvent.getParameter("bindingParams");
			const aSmartFilters = oBindingParams.filters || [];
			const Filter = sap.ui.model.Filter;
			const FilterOperator = sap.ui.model.FilterOperator;

			const allowedTipoEq = Array.isArray(aDefaultTipoEquipo) ? new Set(aDefaultTipoEquipo) : new Set();
			const NO_MATCH_VALUE = "XX"; // cambiá a "" si preferís

			// ===== helpers =====
			function fixFilterFecha(oFilter) {
				try {
					const p = oFilter.sPath || "";
					if (p.includes("Desde") || p.includes("Hasta")) {
						if (oFilter.sOperator === "LE") {
							oFilter.oValue1.setMinutes(oFilter.oValue1.getMinutes() - oFilter.oValue1.getTimezoneOffset());
						} else {
							oFilter.oValue1?.setMinutes(oFilter.oValue1.getMinutes() + oFilter.oValue1.getTimezoneOffset());
							oFilter.oValue2?.setMinutes(oFilter.oValue2.getMinutes() - oFilter.oValue2.getTimezoneOffset());
						}
					}
				} catch (e) { }
			}

			function walkFixDates(aFilters) {
				for (const f of aFilters) {
					if (f.aFilters && f.aFilters.length) walkFixDates(f.aFilters);
					else fixFilterFecha(f);
				}
			}

			function serializeFilter(f) {
				if (f.aFilters && f.aFilters.length) {
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
				if (!arr._sigs.has(sig)) { arr.push(f); arr._sigs.add(sig); }
			}

			// Quitar SIEMPRE cualquier filtro de Tipoequipo; luego lo REEMPLAZAMOS por uno solo
			function stripTipoEq(f) {
				if (f.aFilters && f.aFilters.length) {
					const kids = f.aFilters.map(stripTipoEq).filter(Boolean);
					if (!kids.length) return null;
					if (kids.length === 1) return kids[0];
					return new Filter({ filters: kids, and: !!f.bAnd });
				} else {
					return (f.sPath === "Tipoequipo") ? null : f;
				}
			}

			// Recolectar Tipoequipo desde la lista de filtros (SFB ya procesada)
			function collectRequestedTipoEqFromFilters(f, bucket) {
				if (f.aFilters && f.aFilters.length) {
					f.aFilters.forEach(c => collectRequestedTipoEqFromFilters(c, bucket));
				} else if (f.sPath === "Tipoequipo" && f.oValue1 != null) {
					bucket.push(f.oValue1);
				}
			}


			function collectRequestedTipoEqFromSFBControl(oSFB, bucket) {
				if (!oSFB) return;
				const ctl = oSFB.getControlByKey?.("Tipoequipo");
				if (!ctl) return;

				if (typeof ctl.getSelectedKeys === "function") {
					const keys = ctl.getSelectedKeys() || [];
					keys.forEach(k => { if (k) bucket.push(k); });
				}
			}

			function buildTipoEqOr(values) {
				return new Filter({
					filters: values.map(v => new Filter("Tipoequipo", FilterOperator.EQ, v)),
					and: false
				});
			}

			// ===== 1) Fix fechas SFB =====
			walkFixDates(aSmartFilters);

			// ===== 2) Custom filters existentes =====
			const aCustomFilters = this._getFilters?.() || [];

			// ===== 3) Filtros desde SFB (IdBDE, Elemento) =====
			const oSFB = this.byId("idSmartFilterBar");
			if (oSFB) {
				const oIdBDE = oSFB.getControlByKey?.("IdBde");
				const idBDEVal = oIdBDE?.getValue?.().trim();
				if (idBDEVal) {
					aCustomFilters.push(new Filter("IdBde", FilterOperator.EQ, idBDEVal));
				}

					const IdPagoTran = oSFB.getControlByKey?.("IdPagoTran");
				const IdPagoTranVal = IdPagoTran?.getValue?.().trim();
				if (IdPagoTranVal) {
					aCustomFilters.push(new Filter("IdPagoTran", FilterOperator.EQ, IdPagoTranVal));
				}

				const oUbicacion = oSFB.getControlByKey?.("Estacion");
				const ubicacionEVal = oUbicacion?.getValue?.().trim();
				if (ubicacionEVal) {
					aCustomFilters.push(new Filter("Ubicacion", FilterOperator.EQ, ubicacionEVal));
				}

				const oElem = oSFB.getControlByKey?.("Elemento");
				const selectedKeys = oElem?.getSelectedKeys?.() || [];
				if (selectedKeys.length) {
					aCustomFilters.push(new Filter(
						selectedKeys.map(k => new Filter("Elemento", FilterOperator.EQ, k)),
						false
					));
				}
				const oNemo = oSFB.getControlByKey?.("Nemo");
				const aNemoKeys = oNemo?.getSelectedKeys?.() || [];
				if (aNemoKeys.length) {
					aCustomFilters.push(new Filter(
						aNemoKeys.map(k => new Filter("Nemo", FilterOperator.EQ, k)),
						false
					));
				}
			}

			// ===== 4) Detectar intento de Tipoequipo robusto (filtros + control SFB) =====
			const requestedTipoEq = [];
			aSmartFilters.forEach(f => collectRequestedTipoEqFromFilters(f, requestedTipoEq));
			collectRequestedTipoEqFromSFBControl(oSFB, requestedTipoEq);

			// normalizar (quitar duplicados)
			const requestedSet = new Set(requestedTipoEq.filter(Boolean));
			const attemptedByUser = requestedSet.size > 0;

			// Intersección con el grupo de ESTA tabla
			const allowedIntersection = [...requestedSet].filter(v => allowedTipoEq.has(v));

			// ===== 5) Ensamblar final SIN Tipoequipo (luego lo reemplazamos) =====
			const aFinalFilters = [];
			for (const f of aSmartFilters) {
				const s = stripTipoEq(f);
				if (s) pushIfNotDuplicate(aFinalFilters, s);
			}
			for (const f of aCustomFilters) {
				const s = stripTipoEq(f);
				if (s) pushIfNotDuplicate(aFinalFilters, s);
			}

			// ===== 6) Reemplazo de Tipoequipo por tabla =====
			if (attemptedByUser) {
				if (allowedIntersection.length > 0) {
					// Esta tabla reconoce el/los valores pedidos
					pushIfNotDuplicate(aFinalFilters, buildTipoEqOr(allowedIntersection));
				} else {
					// Esta tabla NO los reconoce → forzar 0 resultados con "XX"
					pushIfNotDuplicate(aFinalFilters, new Filter("Tipoequipo", FilterOperator.EQ, NO_MATCH_VALUE));
				}
			} else {
				// Usuario NO filtró → aplicar default del grupo de la tabla
				if (allowedTipoEq.size) {
					pushIfNotDuplicate(aFinalFilters, buildTipoEqOr([...allowedTipoEq]));
				}
			}

			// ===== 7) Filtro Empresa =====
			const sEmpresa = this.getView().getModel("viewModel")?.getProperty("/sociedad");
			const alreadyHasEmpresa = aFinalFilters.some(f =>
				(f.sPath === "Empresa") || (f.aFilters && f.aFilters.some(sub => sub.sPath === "Empresa"))
			);
			if (sEmpresa && !alreadyHasEmpresa) {
				pushIfNotDuplicate(aFinalFilters, new Filter("Empresa", FilterOperator.EQ, sEmpresa));
			}

			// ===== 8) Vencidos =====
			const vm = this.getModel("viewModel");
			if (vm?.getProperty("/showCoefVencidosOnly")) {
				const vencidosFilter = new Filter({
					filters: [
						new Filter("Hastacoeficiente", FilterOperator.LT, new Date()), // menor a hoy
						new Filter("Coefreduc", FilterOperator.GT, "0.0000")           // mayor a 0.0000
					],
					and: true // usa AND para que cumpla ambas condiciones
				});
				pushIfNotDuplicate(aFinalFilters, vencidosFilter);
			}



			// ===== devolver =====
			oBindingParams.filters = aFinalFilters;
		},




		onEditarEquipo: async function (oEvent) {
			var oContext = oEvent.getSource().getBindingContext(),
			var oContext = oEvent.getSource().getBindingContext(),
				oData = oContext.getObject(),
				oView = this.getView();

			this._sEditingEntityPath = oContext ? oContext.getPath() : null;
			this._sEditingEntitySet = this._sEditingEntityPath ? this._sEditingEntityPath.split("(")[0] : null;
			this._oAutomatismoKeyCache = this._sEditingEntitySet === "/AutomatismosSet"
				? this._parseAutomKeyFromPath(this._sEditingEntityPath)
				: null;

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
					this._sEditingEntityPath = null;
					this._sEditingEntitySet = null;
					this._oAutomatismoKeyCache = null;
					this._sEditingEntityPath = null;
					this._sEditingEntitySet = null;
					this._oAutomatismoKeyCache = null;
					oEvent.getSource().destroy();
				}.bind(this));
				}.bind(this));

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
		_fetchEntityByPath: function (sPath, vModel) {
			return new Promise((resolve, reject) => {
				const oModel = typeof vModel === "string"
					? this.getOwnerComponent().getModel(vModel)
					: (vModel || this.getModel());
				oModel.read(sPath, {
					success: function (oData) {
						resolve(oData);
					},
					error: function (oError) {
						reject(oError);
					}
				});
			});
		},
		_mapAutomatismoDataForEdit: function (oData) {
			if (!oData) { return oData; }
			const keyCache = this._oAutomatismoKeyCache || this._parseAutomKeyFromPath(this._sEditingEntityPath) || {};
			const preferVal = (...vals) => {
				for (const v of vals) {
					const val = (typeof v === "function") ? v() : v;
					if (val !== undefined && val !== null && val !== "") {
						return val;
					}
				}
				return null;
			};
			const toDate = (val) => this._parseDateValue(val) || val;

			const fechaEntrada = toDate(oData.FechaEntrada);
			const fechaDesde = toDate(oData.FechaDesde);
			const fechaHasta = toDate(oData.FechaHasta);

			if (!oData.Fechainicioactividad) {
				oData.Fechainicioactividad = fechaEntrada || fechaDesde || oData.Fechainicioactividad;
			} else {
				oData.Fechainicioactividad = toDate(oData.Fechainicioactividad);
			}

			if (!oData.Fechafinactividad) {
				oData.Fechafinactividad = fechaHasta || oData.Fechafinactividad;
			} else {
				oData.Fechafinactividad = toDate(oData.Fechafinactividad);
			}

			oData.FechaDesde = fechaDesde || oData.FechaDesde;
			oData.FechaHasta = fechaHasta || oData.FechaHasta;
			oData.FechaEntrada = fechaEntrada || oData.FechaEntrada;

			if (!oData.IdPagoTran && oData.IdPagotran) {
				oData.IdPagoTran = oData.IdPagotran;
			}
			oData.IdPagotran = preferVal(oData.IdPagotran, oData.IdPagoTran, oData.ID_PAGOTRAN, keyCache.IdPagotran, keyCache.IdPagoTran);
			oData.IdPagoTran = preferVal(oData.IdPagoTran, oData.IdPagotran, oData.ID_PAGOTRAN, keyCache.IdPagotran, keyCache.IdPagoTran);
			oData.IdBde = preferVal(oData.IdBde, oData.ID_BDE, keyCache.IdBde);
			oData.Empresa = preferVal(oData.Empresa, oData.EMPRESA, keyCache.Empresa, keyCache.EMPRESA, () => this.getModel("viewModel")?.getProperty("/sociedad"));
			oData.Idauto = preferVal(oData.Idauto, oData.IdAuto, oData.IDAUTO, keyCache.Idauto, keyCache.IdAuto, keyCache.IDAUTO);
			oData.Descripcion = oData.Descripcion || "";
			oData.Nemo = oData.Nemo || "";

			return oData;
		},


		onCancelarEditar: function () {
			this._oDialogEdit.close();
		},


		onGuardarEquipo: function () {
			const oView = this.getView();
			const oDialogEdit = this._oDialogEdit;
			const oData = oDialogEdit.getModel("editModel").getData();

			if (!this._validateAutomatismoActivityDates(oData)) {
				return;
			}


			// const sPath = this.getModel().createKey("/EquiposPenalidadesSet", {
			// 	Empresa: oData.Empresa,
			// 	Codigoequipo: oData.Codigoequipo,
			// 	Desde: oData.Desde
			// });
			const oKeyParams = {
			// const sPath = this.getModel().createKey("/EquiposPenalidadesSet", {
			// 	Empresa: oData.Empresa,
			// 	Codigoequipo: oData.Codigoequipo,
			// 	Desde: oData.Desde
			// });
			const oKeyParams = {
				Empresa: oData.Empresa,
				Codigoequipo: oData.Codigoequipo,
				Desde: oData.Desde
			};
			const sDefaultPath = this.getModel().createKey("/EquiposPenalidadesSet", oKeyParams);
			const sEntitySet = this._sEditingEntitySet || "";
			let sPath = this._sEditingEntityPath || sDefaultPath;

			let oPayloadForUpdate = oData;

			if (sEntitySet === "/AutomatismosSet") {
				const oParsedPathKey = this._parseAutomKeyFromPath(this._sEditingEntityPath);
				if (oParsedPathKey && this._sEditingEntityPath) {
					sPath = this._sEditingEntityPath;
					const oAutomPayload = this._buildAutomatismoPayload(oData, oParsedPathKey);
					if (!oAutomPayload) {
						MessageBox.error("Faltan datos clave para actualizar el automatismo (Elemento, Mandt, IdBDE o IdPagotran).");
						return;
					}
					oPayloadForUpdate = oAutomPayload;
				} else {
					const oAutomKey = this._buildAutomatismoKey(oData);
					if (!oAutomKey) {
						MessageBox.error("Faltan datos clave para actualizar el automatismo (Elemento, Mandt, IdBDE o IdPagotran).");
						return;
					}
					sPath = oAutomKey.path;
					const oAutomPayload = this._buildAutomatismoPayload(oData, oAutomKey);
					if (!oAutomPayload) {
						MessageBox.error("Faltan datos clave para actualizar el automatismo (Elemento, Mandt, IdBDE o IdPagotran).");
						return;
					}
					oPayloadForUpdate = oAutomPayload;
				}
			}

			let oHastaCoefPicker = oView.byId("Hastacoeficiente");

			if (!oData.Hastacoeficiente) {

				// Fecha por defecto 31/12/9999
				const fechaDefault = new Date(9999, 11, 31);


				oData.Hastacoeficiente = fechaDefault;


				if (oHastaCoefPicker) {
					oHastaCoefPicker.setDateValue(fechaDefault);
				}
			}

			// === Normalizar campos antes del guardado ===
			oData.Regionpenalidades = (oData.RegionpenalidadesKeys || []).join(" ");
			oData.Remuneracion = oData.Remuneracion ? "X" : "";
			oData.Penaliza = oData.Penaliza ? "X" : "";
			oData.Flagperdidarem = oData.Flagperdidarem ? "X" : "";
			delete oData.RegionpenalidadesKeys;

			// === Diálogo para pedir fecha de modificación ===
			const oDatePicker = new sap.m.DatePicker({
				valueFormat: "yyyy-MM-dd",
				displayFormat: "dd.MM.yyyy",
				placeholder: "dd.mm.aaaa"
			});
			oDatePicker.setDateValue(new Date());

			const oDialog = new sap.m.Dialog({
				title: "Ingrese fecha de modificación",
				type: "Message",
				content: [oDatePicker],
				beginButton: new sap.m.Button({
					text: "Guardar",
					type: "Emphasized",
					press: function () {
						const dSel = oDatePicker.getDateValue();

						if (!dSel) {
							oDatePicker.setValueState(sap.ui.core.ValueState.Error);
							oDatePicker.setValueStateText("Seleccioná una fecha.");
							return;
						}

						oDatePicker.setValueState(sap.ui.core.ValueState.None);
						oData.FechaMod = dSel;

						const oPayloadForBackend = { ...oPayloadForUpdate };
						delete oPayloadForBackend._isAutomatismo;

						if (bIsAutomatismo) {
							console.debug("[Automatismo] update path/payload", sPath, oPayloadForBackend);
						}

						oDialogEdit.setBusy(true);
						this.getModel().update(sPath, oPayloadForUpdate, {
							success: function () {
								sap.m.MessageBox.success(this.getResourceBundle().getText("ed_msg_exito"));
								this._refreshTablesAfterUpdate(sEntitySetToRefresh);
								oDialogEdit.setBusy(false);
								oDialogEdit.close();
								oDialog.close();
							}.bind(this),
							error: function () {
								sap.m.MessageBox.error(this.getResourceBundle().getText("ed_msg_error"));
								oDialogEdit.setBusy(false);
							}.bind(this)
						});
					}.bind(this)
				}),
				endButton: new sap.m.Button({
					text: "Cancelar",
					press: function () { oDialog.close(); }
				}),
				afterClose: function () {
					oDialog.destroy();
				}
			});

			oDialog.open();
		},

		_validateAutomatismoActivityDates: function (oData) {
			if (!this._isAutomSetName(this._sEditingEntitySet)) {
				return true;
			}

			const oView = this.getView();
			const oInicioPicker = oView.byId("dpInicioActividad");
			const oFinPicker = oView.byId("dpFinActividad");
			const toDate = (v) => this._parseDateValue(v);
			const oInicio = toDate(oData?.Fechainicioactividad);
			const oFin = toDate(oData?.Fechafinactividad);

			const setState = (oPicker, bHasValue, sText) => {
				if (!oPicker) { return; }
				const state = bHasValue ? sap.ui.core.ValueState.None : sap.ui.core.ValueState.Error;
				oPicker.setValueState(state);
				oPicker.setValueStateText(bHasValue ? "" : sText);
			};

			setState(oInicioPicker, !!oInicio, "Ingresá la fecha de inicio de actividad.");
			setState(oFinPicker, !!oFin, "Ingresá la fecha de fin de actividad.");

			if (!oInicio || !oFin) {
				MessageBox.warning("Debés completar Fecha inicio de actividad y Fecha fin de actividad para guardar los cambios.");
				return false;
			}

			oData.Fechainicioactividad = oInicio;
			oData.Fechafinactividad = oFin;
			return true;
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

		onLimpiarFiltros: function () {
			const oSFB = this.getView().byId("idSmartFilterBar");
			const oView = this.getView()


			oSFB.getControlByKey("CodigoEquipo")?.setSelectedKeys([]);
			oSFB.getControlByKey("Tipoequipo")?.setSelectedKeys([]);
			oSFB.getControlByKey("Regionpenalidades")?.setSelectedKeys([]);
			oSFB.getControlByKey("Elemento")?.setSelectedKeys([]);
			oSFB.getControlByKey("Nemo")?.setSelectedKeys([]);
			oSFB.getControlByKey("Estacion")?.setValue("");
			oSFB.getControlByKey("IdBDE")?.setValue("");
			oSFB.getControlByKey("IdPagoTran")?.setValue("");


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

		_buildAutomatismoKey: function (oData) {
			if (!oData) { return null; }
			const oKeyCache = this._oAutomatismoKeyCache || this._parseAutomKeyFromPath(this._sEditingEntityPath) || {};
			const sElemento = oData.Elemento || oData.ELEMENTO || oKeyCache.Elemento;
			const sIdBde = oData.IdBde || oData.ID_BDE || oKeyCache.IdBde;
			const sIdPagotran = oData.IdPagotran || oData.ID_PAGOTRAN || oData.IdPagoTran || oKeyCache.IdPagotran || oKeyCache.IdPagoTran;
			const oFechaDesde =
				this._parseDateValue(oData.FechaDesde) ||
				this._parseDateValue(oData.Fechainicioactividad) ||
				oKeyCache.FechaDesdeDate ||
				this._parseDateValue(oKeyCache.FechaDesdeRaw);

			if (!sElemento || !sIdBde || !sIdPagotran || !oFechaDesde) {
				return null;
			}

			const esc = (v) => String(v).replace(/'/g, "''");

			return {
				path: `/AutomatismosSet(Elemento='${esc(sElemento)}',IdBde='${esc(sIdBde)}',IdPagotran='${esc(sIdPagotran)}')`,
				FechaDesde: oFechaDesde
			};
		},

		_buildAutomatismoPayload: function (oData, oKeyInfo) {
			if (!oData) { return null; }
			const pick = (...paths) => {
				for (const p of paths) {
					let val;
					if (typeof p === "function") {
						val = p();
					} else if (p && typeof p === "object") {
						continue;
					} else if (typeof p === "string") {
						val = oData[p];
					}
					if (val != null && val !== "") {
						return val;
					}
				}
				return null;
			};

			const fromVariants = (variants, fallback) => {
				for (const variant of variants) {
					if (typeof variant === "function") {
						const val = variant();
						if (val != null && val !== "") { return val; }
					} else {
						const val = oData[variant];
						if (val != null && val !== "") { return val; }
					}
				}
				return fallback || null;
			};

			const getDate = (val) => this._parseDateValue(val) || null;
			const keyInfo = oKeyInfo || {};

			const sElemento = fromVariants(["Elemento", "ELEMENTO"], keyInfo.Elemento);
			const sMandt = fromVariants(["Mandt", "MANDT"], keyInfo.Mandt);
			const sIdBde = fromVariants(["IdBde", "ID_BDE"], keyInfo.IdBde);
			const sIdPagotran = fromVariants(["IdPagotran", "ID_PAGOTRAN", "IdPagoTran"], keyInfo.IdPagotran || keyInfo.IdPagoTran);

			if (!sElemento || !sMandt || !sIdBde || !sIdPagotran) {
				return null;
			}

			const oFechaDesde = getDate(oData.FechaDesde) || getDate(oData.Fechainicioactividad) || keyInfo.FechaDesdeDate || getDate(keyInfo.FechaDesdeRaw);
			const oFechaHasta = getDate(oData.FechaHasta) || getDate(oData.Fechafinactividad) || keyInfo.FechaHastaDate || getDate(keyInfo.FechaHastaRaw);
			const oFechaEntrada = getDate(oData.FechaEntrada) || getDate(oData.Fechainicioactividad);

			const ensureFlag = (val) => (val === "X" || val === true) ? "X" : "";

			const oPayload = {
				Elemento: sElemento,
				Mandt: sMandt,
				IdBde: sIdBde,
				IdPagotran: sIdPagotran
			};

			const addIfValue = (key, value, transform) => {
				const finalValue = transform ? transform(value) : value;
				if (finalValue !== null && finalValue !== undefined && finalValue !== "") {
					oPayload[key] = finalValue;
				}
			};

			addIfValue("Remuneracion", oData.Remuneracion, ensureFlag);
			addIfValue("Penaliza", oData.Penaliza, ensureFlag);
			addIfValue("Flagperdidarem", oData.Flagperdidarem, ensureFlag);
			addIfValue("Descripcion", pick("Descripcion"));
			addIfValue("Nemo", pick("Nemo"));
			addIfValue("Resolucion", pick("Resolucion"));
			addIfValue("Cebe", pick("Cebe"));
			addIfValue("Ceco", pick("Ceco"));

			if (oFechaDesde) { addIfValue("FechaDesde", oFechaDesde); }
			if (oFechaHasta) { addIfValue("FechaHasta", oFechaHasta); }
			if (oFechaEntrada) { addIfValue("FechaEntrada", oFechaEntrada); }

			return oPayload;
		},

		_parseAutomKeyFromPath: function (sPath) {
			if (typeof sPath !== "string" || !sPath.startsWith("/AutomatismosSet(")) {
				return null;
			}
			const innerStart = sPath.indexOf("(");
			const innerEnd = sPath.lastIndexOf(")");
			if (innerStart < 0 || innerEnd <= innerStart) {
				return null;
			}
			const inner = sPath.substring(innerStart + 1, innerEnd);
			const parts = inner.split(",");
			const result = {};

			parts.forEach(part => {
				const idx = part.indexOf("=");
				if (idx < 0) { return; }
				const key = part.substring(0, idx).trim();
				let value = part.substring(idx + 1).trim();
				if (!key || !value) { return; }

				if (value.startsWith("datetime")) {
					const match = value.match(/datetime'(.*)'/);
					if (match) {
						const oDate = this._parseDateValue(match[1]);
						if (oDate) {
							result[`${key}Date`] = oDate;
						}
						result[key] = value;
					}
				} else if (value.startsWith("'") && value.endsWith("'")) {
					const unescaped = value.slice(1, -1).replace(/''/g, "'");
					result[key] = unescaped;
				}
			});

			return result;
		},

		_parseDateValue: function (v) {
			if (!v) { return null; }
			if (v instanceof Date) { return isNaN(v.getTime()) ? null : v; }
			if (typeof v === "number") {
				const nDate = new Date(v);
				return isNaN(nDate.getTime()) ? null : nDate;
			}

			if (typeof v === "string") {
				const trimmed = v.trim();
				if (!trimmed) { return null; }
				const datetimeMatch = trimmed.match(/^datetime'(.*)'$/);
				if (datetimeMatch) {
					const isoDate = datetimeMatch[1];
					const d = new Date(isoDate);
					return isNaN(d.getTime()) ? null : d;
				}
				const match = trimmed.match(/\/Date\((\d+)\)\//);
				if (match) {
					const oDate = new Date(parseInt(match[1], 10));
					return isNaN(oDate.getTime()) ? null : oDate;
				}
				if (/^\d{8}$/.test(trimmed)) {
					const year = parseInt(trimmed.slice(0, 4), 10);
					const month = parseInt(trimmed.slice(4, 6), 10) - 1;
					const day = parseInt(trimmed.slice(6, 8), 10);
					const d = new Date(year, month, day);
					return isNaN(d.getTime()) ? null : d;
				}
				const dIso = new Date(trimmed);
				if (!isNaN(dIso.getTime())) {
					return dIso;
				}
			}

			return null;
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
		// onEvolucionEquipo: async function (Codigoequipo) {
		// 	let sCodigoEquipo = "";
		// 	var sEmpresa = this.getModel("viewModel").getProperty("/sociedad")
		// 	const bFromParam = typeof Codigoequipo === "string" && Codigoequipo.trim() !== "";

		// 	if (bFromParam) {
		// 		sCodigoEquipo = Codigoequipo;
		// 	} else {
		// 		const oEditModelData = this._oDialogEdit.getModel("editModel").getData();
		// 		sCodigoEquipo = oEditModelData.Codigoequipo;
		// 	}


		// 	const oModel = this.getView().getModel();
		// 	oModel.setUseBatch(false);

		// 	const oFilter = new sap.ui.model.Filter({
		// 		filters: [
		// 			new sap.ui.model.Filter("CODIGOEQUIPO", sap.ui.model.FilterOperator.EQ, sCodigoEquipo),
		// 			new sap.ui.model.Filter("EMPRESA", sap.ui.model.FilterOperator.EQ, sEmpresa)
		// 		],
		// 		and: true
		// 	});


		// 	return new Promise((resolve, reject) => {
		// 		oModel.read("/HistoricoEquipoSet", {
		// 			filters: [oFilter],
		// 			success: (oData) => {
		// 				if (oData.results && oData.results.length > 0) {
		// 					ModelHelper.getModel(this.getView(), "historicoEquipoModel").setData(oData.results);

		// 					if (bFromParam) {
		// 						resolve(oData.results);
		// 					} else {
		// 						if (!this._oHistoricoDialog) {
		// 							this._oHistoricoDialog = sap.ui.xmlfragment("Transener.Operaciones.EquiposPenalidades.view.Fragments.EvolucionEquipo", this);
		// 							this.getView().addDependent(this._oHistoricoDialog);
		// 						}
		// 						this._oHistoricoDialog.open();
		// 						resolve();
		// 					}
		// 				} else {
		// 					if (bFromParam) {
		// 						resolve([]);
		// 					} else {
		// 						sap.m.MessageToast.show("No se encontraron datos históricos.");
		// 						resolve();
		// 					}
		// 				}
		// 			},
		// 			error: (oError) => {
		// 				console.error("Error al leer HistoricoEquipo", oError);
		// 				sap.m.MessageToast.show("Error al cargar histórico");
		// 				reject(oError);
		// 			}
		// 		});
		// 	});
		// }
		onEvolucionEquipo: async function (Codigoequipo) {
			// === Helpers locales ===
			const parseYYYYMMDD = (s) => {
				if (!s) return null;
				if (s instanceof Date) return s;
				const t = String(s).trim();
				if (/^\d{8}$/.test(t)) { // yyyymmdd
					const y = +t.slice(0, 4), m = +t.slice(4, 6) - 1, d = +t.slice(6, 8);
					return new Date(y, m, d);
				}
				// /Date(…)/ de OData
				const m = t.match(/\/Date\((\d+)\)\//);
				if (m) return new Date(+m[1]);
				const d = new Date(t);
				return isNaN(d) ? null : d;
			};

			const toNumber = (v) => {
				if (v == null) return 0;
				if (typeof v === "number") return isNaN(v) ? 0 : v;
				const s = String(v).trim();
				if (!s) return 0;
				// europeo "1.234,56"
				if (s.includes(",")) {
					const clean = s.replace(/\./g, "").replace(",", ".");
					const n = Number(clean);
					return isNaN(n) ? 0 : n;
				}
				const n = Number(s);
				return isNaN(n) ? 0 : n;
			};

			// Normaliza por tipo de dato según campo (fecha / número / string)
			const normByField = (field, val) => {
				const dateFields = new Set(["DESDE", "HASTA", "FECHAINICIOACTIVIDAD", "FECHAFINACTIVIDAD", "HASTACOEFICIENTE"]);
				const numFields = new Set(["PREMIO", "POTENCIA", "COEFREDUC", "COEFICIENTE"]);
				if (dateFields.has(field)) {
					const d = parseYYYYMMDD(val);
					return d ? d.getTime() : null;
				}
				if (numFields.has(field)) return toNumber(val);
				return (val ?? "").toString().trim();
			};

			// Campos a comparar (uno por columna que quieras pintar)
			const compareFields = [
				"CODIGOEQUIPO",
				"ID_BDE",
				"ID_PAGOTRAN",
				"DESDE",
				"HASTA",
				"FECHAINICIOACTIVIDAD",
				"FECHAFINACTIVIDAD",
				"PREMIO",
				"POTENCIA",
				"OBSERVACIONES",
				"COEFREDUC",
				"COEFICIENTE",
				"HASTACOEFICIENTE"
			];

			// === Lógica original con mejoras ===
			let sCodigoEquipo = "";
			const sEmpresa = this.getModel("viewModel").getProperty("/sociedad");
			const bFromParam = typeof Codigoequipo === "string" && Codigoequipo.trim() !== "";

			if (bFromParam) {
				sCodigoEquipo = Codigoequipo;
			} else {
				const oEditModelData = this._oDialogEdit.getModel("editModel").getData();
				sCodigoEquipo = oEditModelData.Codigoequipo;
			}

			const oModel = this.getView().getModel();
			oModel.setUseBatch(false);

			const oFilter = new sap.ui.model.Filter({
				filters: [
					new sap.ui.model.Filter("CODIGOEQUIPO", sap.ui.model.FilterOperator.EQ, sCodigoEquipo),
					new sap.ui.model.Filter("EMPRESA", sap.ui.model.FilterOperator.EQ, sEmpresa)
				],
				and: true
			});

			return new Promise((resolve, reject) => {
				oModel.read("/HistoricoEquipoSet", {
					filters: [oFilter],
					success: (oData) => {
						const arr = (oData.results || []).slice();

						if (arr.length > 0) {
							// 1) Ordenar DESC por DESDE (ajustá si querés otro campo)
							arr.sort((a, b) => {
								const da = normByField("DESDE", a.DESDE);
								const db = normByField("DESDE", b.DESDE);
								return (db ?? 0) - (da ?? 0);
							});

							// 2) Marcar cambios por-campo vs. el registro anterior
							let prev = null;
							for (const rec of arr) {
								rec._changed = false;
								rec._changedFields = {}; // ej: { DESDE: true, PREMIO: true }

								if (prev) {
									compareFields.forEach(f => {
										const pv = normByField(f, prev[f]);
										const cv = normByField(f, rec[f]);
										if (pv !== cv) {
											rec._changed = true;
											rec._changedFields[f] = true;
										}
									});
								}
								prev = rec;
							}

							// 3) Setear modelo
							ModelHelper.getModel(this.getView(), "historicoEquipoModel").setData(arr);

							// 4) Abrir diálogo si corresponde
							if (bFromParam) {
								resolve(arr);
							} else {
								if (!this._oHistoricoDialog) {
									this._oHistoricoDialog = sap.ui.xmlfragment(
										"Transener.Operaciones.EquiposPenalidades.view.Fragments.EvolucionEquipo",
										this
									);
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
		},



		onVerDetalleHistorico: function (oEvent) {

			const oItem = oEvent.getSource().getParent();
			const oContext = oItem.getBindingContext("historicoEquipoModel");

			const oData = oContext.getObject();
			oData.REMUNERACION = oData.REMUNERACION === "X";
			oData.PENALIZA = oData.PENALIZA === "X";
			oData.FLAGPERDIDAREM = oData.FLAGPERDIDAREM === "X";

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
		_wireHasVencidosMonitor: function (smartTableId) {
			const st = this.byId(smartTableId);
			if (!st || st._wireVencidos) return;
			st._wireVencidos = true;

			const wire = () => {
				const inner = st.getTable();
				if (!inner) return;

				const agg = inner.isA("sap.m.Table") ? "items" : "rows";

				const attachToBinding = () => {
					const b = inner.getBinding(agg);
					if (!b || b._hookVencidos) return;
					b._hookVencidos = true;

					const handler = () => this._updateHasVencidosFromBinding(b, smartTableId);
					b.attachDataReceived(handler);
					// por si ya hay datos cargados
					handler();
				};

				attachToBinding();
				st.attachBeforeRebindTable(() => setTimeout(attachToBinding, 0));
			};

			st.getTable() ? wire() : st.attachInitialise(wire);
		},

		_updateHasVencidosFromBinding: function (oBinding, tableId) {
			const vm = this.getModel("viewModel");
			// const ctxs = oBinding.getAllCurrentContexts()
			//const ctxs = oBinding.getContexts(0) || [];

			// o si querés asegurarte con length:
			const iLength = oBinding.getLength();
			const ctxs = oBinding.getContexts(0, iLength) || [];
			let has = false;
			for (let i = 0; i < ctxs.length; i++) {
				const row = ctxs[i].getObject() || {};
				if (this._isExpired(row.Hastacoeficiente, row.Coefreduc)) { has = true; break; }
			}

			// guardo por tabla y recalculo el global
			vm.setProperty("/_hasVencidosMap/" + tableId, has);

			const ids = ["LineasTable", "TransformadoresTable", "ReactoresTable", "AutomatismosTable", "ConexionesTable"];
			const any = ids.some(id => vm.getProperty("/_hasVencidosMap/" + id) === true);
			vm.setProperty("/hasVencidos", any);
		},

		_isExpired: function (v, coef) {
			const coefNum = Number(coef);
			if (!Number.isFinite(coefNum)) return false; // coef inválido => no vencido

			const toDate = (val) => {
				if (val == null) return null;
				if (val instanceof Date) return val;

				if (typeof val === "string") {
					const s = val.trim();
					const mOData = s.match(/\/Date\((\d+)\)\//);
					if (mOData) return new Date(parseInt(mOData[1], 10));
					if (/^\d{8}$/.test(s)) { const y = +s.slice(0, 4), m = +s.slice(4, 6) - 1, d = +s.slice(6, 8); return new Date(y, m, d); }
					if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
					if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { const [d, m, y] = s.split(".").map(Number); return new Date(y, m - 1, d); }
				}
				if (typeof val === "number") return new Date(val);
				return null;
			};

			const d = toDate(v);
			if (!d || isNaN(d.getTime())) return false; // sin fecha válida => no vencido

			const today = new Date();
			d.setHours(0, 0, 0, 0);
			today.setHours(0, 0, 0, 0);

			const isExpired = d.getTime() <= today.getTime();
			return isExpired && (coefNum > 0); // ambas condiciones
		},

		onToggleCoefVencidos: function () {
			const vm = this.getModel("viewModel");
			const cur = !!vm.getProperty("/showCoefVencidosOnly");
			vm.setProperty("/showCoefVencidosOnly", !cur);

			// Rebind de todas las tablas para aplicar/retirar el filtro server-side
			["LineasTable", "TransformadoresTable", "ReactoresTable", "ConexionesTable"]
				.forEach(id => this.byId(id)?.rebindTable());
		},
		onBeforeRebindSmartTable: function (oEvent) {
			const params = oEvent.getParameter("bindingParams");
			const vm = this.getModel("viewModel");

			if (vm.getProperty("/showCoefVencidosOnly")) {
				const todayYMD = this._todayYMD(); // ajustá formato si tu backend espera otro
				const f = new sap.ui.model.Filter("Hastacoeficiente", sap.ui.model.FilterOperator.LE, todayYMD);
				params.filters = params.filters || [];
				params.filters.push(f);
			}
		},
		onClearCoefVencidos: function () {
			const vm = this.getModel("viewModel");
			vm.setProperty("/showCoefVencidosOnly", false);
			["LineasTable", "TransformadoresTable", "ReactoresTable", "AutomatismosTable", "ConexionesTable"]
				.forEach(id => this.byId(id)?.rebindTable());
		},

		_refreshTablesAfterUpdate: function (sEntitySet) {
			if ((sEntitySet || "").toLowerCase().indexOf("/automatismos") === 0) {
				this.byId("AutomatismosTable")?.rebindTable();
			}
		},
	});
});

