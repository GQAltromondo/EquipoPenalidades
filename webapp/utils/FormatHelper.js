sap.ui.define([], function () {
  "use strict";

  return {
    /**
     * Convierte una cadena OData UTC (/Date(1758499200000)/) a formato dd.MM.yyyy
     * @param {string} sValue Valor en formato /Date(…)/ o timestamp numérico
     * @returns {string} Ej: "13.10.2025"
     */
    formatDateFromUTC: function (sValue) {
      if (!sValue) return "";

      // Si viene como string tipo "/Date(…)/"
      var timestamp = parseInt(String(sValue).replace(/[^0-9]/g, ""), 10);
      if (isNaN(timestamp)) return "";

      var oDate = new Date(timestamp);
      var dd = String(oDate.getDate()).padStart(2, "0");
      var mm = String(oDate.getMonth() + 1).padStart(2, "0");
      var yyyy = oDate.getFullYear();

      return `${dd}.${mm}.${yyyy}`;
    },

    /**
     * Convierte una fecha tipo "yyyy-MM-dd" a "dd.MM.yyyy"
     * @param {string} sValue Valor ISO simple
     * @returns {string} Ej: "13.10.2025"
     */
    formatDateFromISO: function (sValue) {
      if (!sValue) return "";
      var parts = sValue.split("-");
      if (parts.length !== 3) return sValue;
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    },

    /**
     * Convierte un objeto Date a formato "yyyy-MM-dd"
     * útil antes de enviar al backend
     * @param {Date} oDate Objeto Date de JS
     * @returns {string}
     */
    formatDateToISO: function (oDate) {
      if (!(oDate instanceof Date)) return "";
      const yyyy = oDate.getFullYear();
      const mm = String(oDate.getMonth() + 1).padStart(2, "0");
      const dd = String(oDate.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  };
});
