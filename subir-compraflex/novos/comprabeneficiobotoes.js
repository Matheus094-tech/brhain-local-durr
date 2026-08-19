/*
 * CompraBeneficioBotoes
 * durr.main.dev.business.comprabeneficiobotoes
 *
 */
module.exports = (function () {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.business.comprabeneficiobotoes');

  var src = require('plusoftcrm.libs.main.source')({
    'compraBeneficio': 'durr.main.dev.business.comprabeneficio'
  });

  function getActions(params) {
    var actions = [];

    if (params && params.id > 0) {
      actions.push({
        'action': 'botao-calcular',
        'label': 'Calcular',
        'icon': 'fa fa-calculator',
        'class': 'btn-warning'
      });
    }

    return actions;
  }

  function invoke(params) {
    var action = params && params.action;
    var idCompraBeneficio = params && params.id;

    if (action !== 'botao-calcular') return;

    if (!idCompraBeneficio) {
      throw 'ID da compra de benefício é obrigatório.';
    }

    // params.data não é usado: CompraBeneficio relê tudo do banco.
    return src.require('compraBeneficio').processarCompra(idCompraBeneficio);
  }

  return {
    'actions': getActions,
    'invoke': invoke
  };
})();
