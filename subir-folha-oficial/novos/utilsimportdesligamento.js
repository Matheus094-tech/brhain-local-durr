/*
 * UtilsImportDesligamento
 * durr.main.dev.integracao.utilsimportdesligamento
 *
 */
module.exports = (function() {
  'use strict';

  var src = require('plusoftcrm.libs.main.source')({
    'utilsImportFolha': 'durr.main.dev.integracao.utilsimportfolha'
  });

  var utilsFolha = src.require('utilsImportFolha');

  function campoPreenchido(valor) {
    return utilsFolha.campoPreenchido(valor);
  }

  function textoLimpo(valor) {
    return utilsFolha.textoLimpo(valor);
  }

  function formatarCpf(valor) {
    return utilsFolha.formatarCpf(valor);
  }

  function converterDataOficial(valor) {
    return utilsFolha.converterDataOficial(valor);
  }

  function buscarUm(entidade, filtros) {
    return utilsFolha.buscarUm(entidade, filtros);
  }

  function mapeamentoCodigoFolha(entidade, codigoFolha, colunaRetorno) {
    return utilsFolha.mapeamentoCodigoFolha(entidade, codigoFolha, colunaRetorno);
  }

  function mapeamentoCodigoFolhaOuCriar(entidade, codigoFolha, nomeDescricao, colunaRetorno, idGrupoEconomico) {
    return utilsFolha.mapeamentoCodigoFolhaOuCriar(entidade, codigoFolha, nomeDescricao, colunaRetorno, idGrupoEconomico);
  }

  function formatarDiagnostico(tag, status, motivo, contexto) {
    return utilsFolha.formatarDiagnostico(tag, status, motivo, contexto);
  }

  function criarRelatorioImportacao() {
    return utilsFolha.criarRelatorioImportacao();
  }

  function registrarSucesso(relatorio, referencia, mensagem, dados) {
    return utilsFolha.registrarSucesso(relatorio, referencia, mensagem, dados);
  }

  function registrarErro(relatorio, referencia, mensagem, dados) {
    return utilsFolha.registrarErro(relatorio, referencia, mensagem, dados);
  }

  function registrarAviso(relatorio, referencia, mensagem, dados) {
    return utilsFolha.registrarAviso(relatorio, referencia, mensagem, dados);
  }

  function finalizarContadoresImportacao(importlog) {
    return utilsFolha.finalizarContadoresImportacao(importlog);
  }

  function normalizarValorComparacaoData(valor) {
    if (valor === null || typeof valor === 'undefined' || valor === '') return null;
    var data = (valor instanceof Date) ? valor : new Date(valor);
    if (isNaN(data.getTime())) return null;
    return data.toISOString().substring(0, 10);
  }

  return {
    campoPreenchido: campoPreenchido,
    textoLimpo: textoLimpo,
    formatarCpf: formatarCpf,
    converterDataOficial: converterDataOficial,
    buscarUm: buscarUm,
    mapeamentoCodigoFolha: mapeamentoCodigoFolha,
    mapeamentoCodigoFolhaOuCriar: mapeamentoCodigoFolhaOuCriar,
    formatarDiagnostico: formatarDiagnostico,
    finalizarContadoresImportacao: finalizarContadoresImportacao,
    normalizarValorComparacaoData: normalizarValorComparacaoData,
    criarRelatorioImportacao: criarRelatorioImportacao,
    registrarSucesso: registrarSucesso,
    registrarErro: registrarErro,
    registrarAviso: registrarAviso
  };
})();
