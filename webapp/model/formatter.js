sap.ui.define([], function () {
    "use strict";

    // ======= Nuevas constantes y util =======
    const LINEAS = new Set(["L1", "L2", "L3", "L4", "L5", "L6"]);
    const TRANSFREACT = new Set(["CS", "KS", "RB", "RL", "RT", "TR", "AU"]);
    const CONEXIONES = new Set(["P6", "P5", "P4", "P3", "P2", "P1"])


    function norm(v) {
        return (v == null ? "" : String(v)).trim().toUpperCase();
    }

    return {

        // ======= TUS FUNCIONES EXISTENTES =======
        iconReg: function (sReg) {
            if (sReg === "X") {
                return "sap-icon://accept";
            } else {
                return "sap-icon://decline";
            }
        },

        colorReg: function (sReg) {
            if (sReg === "X") {
                return "#3fa45b";
            } else {
                return "#dc0d0e";
            }
        },

        isLinea: function (sTipoEquipo) {
            return LINEAS.has(norm(sTipoEquipo));
        },


        isTransformador: function (sTipoEquipo) {
            return TRANSFREACT.has(norm(sTipoEquipo));
        },


        // Devuelve la categoría en texto: LINEA | TRANSFORMADOR | REACTOR | OTRO
        categoriaEquipo: function (sTipoEquipo) {
            const v = norm(sTipoEquipo);
            if (LINEAS.has(v)) return "LINEA";
            if (TRANSF.has(v)) return "TRANSFORMADOR";
            return "OTRO";
        },
        formatDateFromYYYYMMDD: function (value) {
            if (!value || typeof value !== "string" || value.length !== 8) return value;

            const year = value.substring(0, 4);
            const month = value.substring(4, 6);
            const day = value.substring(6, 8);

            return `${day}.${month}.${year}`;
        },
    formatDateDDMMYYYY: function (date) {
    if (!date) return "";

    const d = new Date(date); // 2025-10-30T00:00:00Z
    // 🚀 Crear copia “localizada” sumando el offset para compensar la conversión del navegador
    const corrected = new Date(d.getTime() + d.getTimezoneOffset() * 60000);

    const day = String(corrected.getDate()).padStart(2, "0");
    const month = String(corrected.getMonth() + 1).padStart(2, "0");
    const year = corrected.getFullYear();

    return `${day}.${month}.${year}`;
},

        formatCoeficiente5: function (v) {
  if (v == null || v === "") return "";
  const n = Number(String(v).replace(",", ".")); // por si viniera con coma

    },
    stateForChanged: function (changed) {
    return changed ? sap.ui.core.ValueState.Warning : sap.ui.core.ValueState.None;
  }
}
});
