sap.ui.define([
    "sap/ui/model/json/JSONModel"
], function (JSONModel) {
    "use strict";

    return {
        getModel: function (oView, sModelName, oInitialData = {}) {
            let oModel = oView.getModel(sModelName);

            if (!oModel) {
                oModel = new JSONModel(oInitialData);
                oView.setModel(oModel, sModelName);
            }

            return oModel;
        }
    };
});
