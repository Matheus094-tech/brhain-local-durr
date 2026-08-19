/*
 * BusinessArquivoCompraFlex
 * durr.main.dev.business.arquivocompraflex
 *
 */
module.exports = (function () {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.business.arquivocompraflex');

  var src = require('plusoftcrm.libs.main.source')({
    'excel': 'plusoftcrm.libs.main.excel'
  });

  // Ordem oficial do layout Flash; buckets não usados na V1 ficam em branco.
  var COLUNAS_LAYOUT_FLASH = {
    cnpj: 'CNPJ',
    nomeCompleto: 'NOME COMPLETO',
    cpf: 'CPF',
    multibeneficios: 'MULTIBENEFICIOS (R$)',
    alimentacaoRefeicao: 'ALIMENTACAO E REFEICAO (R$)',
    refeicao: 'REFEICAO (R$)',
    alimentacao: 'ALIMENTACAO (R$)',
    mobilidade: 'MOBILIDADE EXCLUSIVO (R$)',
    premiacaoCartao: 'PREMIACAO NO CARTAO (R$)',
    valeTransporte: 'VALE TRANSPORTE (R$)'
  };

  function gerarArquivo(compra, linhas) {
    var nomeArquivo = 'compra-beneficio-flex-' + compra.id_brh_compra_beneficio + '.xlsx';

    var fileId = src.require('excel').toFile({
      name: nomeArquivo,
      sheetName: 'Flash',
      cols: COLUNAS_LAYOUT_FLASH,
      rows: linhas
    });

    logger.info('Arquivo Flex gerado para a compra ' + compra.id_brh_compra_beneficio + ': ' + nomeArquivo + ' (fileId ' + fileId + ')');

    return {
      fileId: fileId,
      nomeArquivo: nomeArquivo
    };
  }

  return {
    gerarArquivo: gerarArquivo
  };
})();
