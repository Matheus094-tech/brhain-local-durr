/*
 * BusinessCompraBeneficio
 * durr.main.dev.business.comprabeneficio
 *
 */
module.exports = (function () {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.business.comprabeneficio');

  var src = require('plusoftcrm.libs.main.source')({
    'compraFlex': 'durr.main.dev.business.compraflex'
  });

  var ESTRATEGIAS = {
    'FlexCard': function (compra) {
      return src.require('compraFlex').processarCompra(compra);
    }
  };

  function processarCompra(idCompraBeneficio) {
    var compra = buscarCompra(idCompraBeneficio);
    if (!compra) {
      throw src.new('UserException')('Compra de benefício não encontrada: ' + idCompraBeneficio);
    }

    var estrategia = ESTRATEGIAS[compra.tipo_produto_nome];
    if (!estrategia) {
      throw src.new('UserException')('Produto sem estratégia de compra implementada: ' + compra.tipo_produto_nome);
    }

    logger.info('Processando compra de benefício ' + idCompraBeneficio + ' via estratégia ' + compra.tipo_produto_nome);

    return estrategia(compra);
  }

  function buscarCompra(idCompraBeneficio) {
    return src.require('knex')('BRH_COMPRA_BENEFICIO CB')
      .join('BRH_PRODUTO P', 'P.ID_BRH_PRODUTO = CB.ID_BRH_PRODUTO')
      .join('BRH_TIPO_PRODUTO TP', 'TP.ID_BRH_TIPO_PRODUTO = P.ID_BRH_TIPO_PRODUTO')
      .select(
        'CB.*',
        'TP.DS_NOME AS tipo_produto_nome'
      )
      .where('CB.ID_BRH_COMPRA_BENEFICIO', idCompraBeneficio)
      .findFirst();
  }

  return {
    processarCompra: processarCompra
  };
})();
