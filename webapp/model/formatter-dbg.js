sap.ui.define([], function () {
    "use strict";

    return {

        iconReg: function (sReg) {
            if(sReg === "X"){
            	return "sap-icon://accept";
            } else {
            	return "sap-icon://decline";
            }
        },
        
        colorReg: function (sReg) {
            if(sReg === "X"){
            	return "#3fa45b";
            } else {
            	return "#dc0d0e";
            }
        }
        
    };

});