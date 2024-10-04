/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"Transener/Operaciones/EquiposPenalidades/test/integration/AllJourneys"
	], function () {
		QUnit.start();
	});
});