/*
 * UtilsImportAfastados
 * durr.main.dev.integracao.utilsimportafastados
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

  function normalizarNomeTipo(valor) {
    return textoLimpo(valor).toUpperCase();
  }

  // "FE - Férias" -> "FE". Só o prefixo curto antes do hífen é extraído; o nome
  // completo (com o prefixo) continua sendo o DS_NOME persistido.
  function extrairCodigoTipo(nomeTipo) {
    var match = /^([A-Za-zÀ-ÿ0-9]{1,10})\s*-\s*.+$/.exec(textoLimpo(nomeTipo));
    return match ? match[1].trim() : null;
  }

  // Datas do layout de afastados chegam como texto DD/MM/AAAA (célula tipo texto no
  // Excel, não data nativa). Retorna null quando não informado, undefined quando inválido.
  function converterDataAfastamento(valor) {
    if (!campoPreenchido(valor)) return null;
    var texto = valor.toString().trim();
    var partes = texto.split('/');
    if (partes.length !== 3) return undefined;

    var dia = parseInt(partes[0], 10);
    var mes = parseInt(partes[1], 10);
    var ano = parseInt(partes[2], 10);
    if (!dia || !mes || !ano) return undefined;

    var data = new Date(ano, mes - 1, dia);
    var valida = data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
    return valida ? data : undefined;
  }

  function diferencaDias(dataInicio, dataFim) {
    var umDiaEmMs = 24 * 60 * 60 * 1000;
    return Math.round((dataFim.getTime() - dataInicio.getTime()) / umDiaEmMs);
  }

  function subtrairUmDia(data) {
    var resultado = new Date(data.getTime());
    resultado.setDate(resultado.getDate() - 1);
    return resultado;
  }

  var DT_TERMINO_ABERTO = '9999-12-31';

  // DT_TERMINO é NOT NULL em BRH_AFASTAMENTO neste ambiente; afastamento em
  // aberto (sem Data de Retorno) é persistido com esta data sentinela.
  function dataTerminoAberto() {
    return new Date(9999, 11, 31);
  }

  function normalizarValorComparacaoData(valor) {
    if (valor === null || typeof valor === 'undefined' || valor === '') return null;
    var data = (valor instanceof Date) ? valor : new Date(valor);
    if (isNaN(data.getTime())) return null;
    return data.toISOString().substring(0, 10);
  }

  // Reconhece null (compatibilidade com dado legado) e a data sentinela como "aberto".
  function ehAfastamentoAberto(dtTermino) {
    if (dtTermino === null || typeof dtTermino === 'undefined' || dtTermino === '') return true;
    return normalizarValorComparacaoData(dtTermino) === DT_TERMINO_ABERTO;
  }

  function criarRelatorioImportacao() {
    return {
      sucesso: true,
      totalRecebidos: 0,
      totalCriados: 0,
      totalAtualizados: 0,
      totalSemAlteracao: 0,
      totalFalhas: 0,
      detalhes: [],
      avisos: [],
      erros: []
    };
  }

  function registrarCriado(relatorio, referencia, mensagem, dados) {
    relatorio.totalCriados++;
    relatorio.detalhes.push({ referencia: referencia, acao: 'criado', mensagem: mensagem, dados: dados || null });
  }

  function registrarAtualizado(relatorio, referencia, mensagem, dados) {
    relatorio.totalAtualizados++;
    relatorio.detalhes.push({ referencia: referencia, acao: 'atualizado', mensagem: mensagem, dados: dados || null });
  }

  function registrarSemAlteracao(relatorio, referencia, mensagem, dados) {
    relatorio.totalSemAlteracao++;
    relatorio.detalhes.push({ referencia: referencia, acao: 'semAlteracao', mensagem: mensagem, dados: dados || null });
  }

  function registrarErro(relatorio, referencia, mensagem, dados) {
    relatorio.sucesso = false;
    relatorio.totalFalhas++;
    relatorio.erros.push({ referencia: referencia, mensagem: mensagem, dados: dados || null });
  }

  function registrarAviso(relatorio, referencia, mensagem, dados) {
    relatorio.avisos.push({ referencia: referencia, mensagem: mensagem, dados: dados || null });
  }

  return {
    campoPreenchido: campoPreenchido,
    textoLimpo: textoLimpo,
    formatarCpf: formatarCpf,
    normalizarNomeTipo: normalizarNomeTipo,
    extrairCodigoTipo: extrairCodigoTipo,
    converterDataAfastamento: converterDataAfastamento,
    diferencaDias: diferencaDias,
    subtrairUmDia: subtrairUmDia,
    dataTerminoAberto: dataTerminoAberto,
    normalizarValorComparacaoData: normalizarValorComparacaoData,
    ehAfastamentoAberto: ehAfastamentoAberto,
    criarRelatorioImportacao: criarRelatorioImportacao,
    registrarCriado: registrarCriado,
    registrarAtualizado: registrarAtualizado,
    registrarSemAlteracao: registrarSemAlteracao,
    registrarErro: registrarErro,
    registrarAviso: registrarAviso
  };
})();
