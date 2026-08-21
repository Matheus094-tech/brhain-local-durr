/*
 * ImportFolha
 * durr.main.dev.integracao.importfolha
 *
 * Wrapper legado — preservado apenas para compatibilidade com layouts antigos
 * que ainda apontem para esta JKey. Os layouts oficiais novos (Folha - Titular
 * e Folha - Dependente) devem usar diretamente ImportFolhaTitular/ImportFolhaDependente.
 *
 * A quantidade de colunas varia por linha (POI só grava células até a última
 * preenchida), por isso o corte de 12 é só um roteador — cada estratégia valida
 * seus próprios campos obrigatórios depois, não a quantidade física recebida.
 */
module.exports = (function () {
  'use strict';
  var src = require('plusoftcrm.libs.main.source')({
    'importFolhaTitular': 'durr.main.dev.integracao.importfolhatitular',
    'importFolhaDependente': 'durr.main.dev.integracao.importfolhadependente',
    'utilsImportFolha': 'durr.main.dev.integracao.utilsimportfolha'
  });
  var utils = src.require('utilsImportFolha');

  var LIMITE_DEPENDENTE = 12;

  function onrecord(to, importto, lineNumber, toUpdate, haveRecord) {
    var colunas = to.columns || [];

    if (colunas.length <= LIMITE_DEPENDENTE) {
      return src.require('importFolhaDependente').onrecord(to, importto, lineNumber, toUpdate, haveRecord);
    }

    return src.require('importFolhaTitular').onrecord(to, importto, lineNumber, toUpdate, haveRecord);
  }

  function onfinish(importlog) {
    return utils.finalizarContadoresImportacao(importlog);
  }

  return {
    'onrecord': onrecord,
    'onfinish': onfinish
  };
})();
