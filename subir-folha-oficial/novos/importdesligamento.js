/*
 * ImportDesligamento
 * durr.main.dev.integracao.importdesligamento
 *
 */
module.exports = (function () {
  'use strict';
  var logger = logging.withLogger('durr.main.dev.integracao.importdesligamento');
  var src = require('plusoftcrm.libs.main.source')({
    'utilsImportDesligamento': 'durr.main.dev.integracao.utilsimportdesligamento',
    'businessImportDesligamento': 'durr.main.dev.integracao.businessImportDesligamento'
  });
  var utils = src.require('utilsImportDesligamento');

  // Há dois cabeçalhos "Nome" no arquivo oficial (colaborador e motivo); o acesso
  // é sempre posicional, então não há colisão.
  var col = {
    empresa: 0,
    matricula: 1,
    nomeColaborador: 2,
    cpf: 3,
    dataDesligamento: 4,
    motivoCodigo: 5,
    motivoNome: 6,
    vinculoCodigo: 7,
    vinculoNome: 8
  };

  function montarDesligamento(colunas) {
    return {
      CodigoEmpresa: colunas[col.empresa],
      Matricula: colunas[col.matricula],
      Nome: colunas[col.nomeColaborador],
      CPF: colunas[col.cpf],
      DataDesligamento: colunas[col.dataDesligamento],
      MotivoCodigo: colunas[col.motivoCodigo],
      MotivoNome: colunas[col.motivoNome],
      VinculoCodigo: colunas[col.vinculoCodigo],
      VinculoNome: colunas[col.vinculoNome]
    };
  }

  function contexto(colunas) {
    return [
      { label: 'Empresa', valor: colunas[col.empresa] },
      { label: 'Matrícula', valor: colunas[col.matricula] },
      { label: 'CPF', valor: colunas[col.cpf] },
      { label: 'Nome', valor: colunas[col.nomeColaborador] }
    ];
  }

  function statusFalha(mensagens) {
    var texto = mensagens.join(' | ');
    return /^Erro ao processar/.test(texto) ? 'ERRO' : 'NAO_PROCESSADO';
  }

  function acaoParaStatus(acao) {
    return acao === 'atualizado' ? 'ATUALIZADO' : 'SEM_ALTERACAO';
  }

  function onrecord(to) {
    var colunas = to.columns || [];
    if (colunas.length !== 9) {
      throw src.new('UserException')('Layout de desligamento não reconhecido — quantidade de colunas recebida: ' + colunas.length + '.');
    }

    var desligamento = montarDesligamento(colunas);
    var resultado = src.require('businessImportDesligamento').processarDesligamento(desligamento);

    resultado.avisos.forEach(function(aviso) {
      logger.warn(utils.formatarDiagnostico('DESLIGAMENTO', 'AVISO', aviso, contexto(colunas)));
    });

    if (!resultado.sucesso) {
      var mensagem = utils.formatarDiagnostico('DESLIGAMENTO', statusFalha(resultado.mensagens), resultado.mensagens.join(' | '), contexto(colunas));
      throw src.new('UserException')(mensagem);
    }

    logger.info(utils.formatarDiagnostico('DESLIGAMENTO', acaoParaStatus(resultado.acao), resultado.mensagens.join(' | '), contexto(colunas)));
  }

  function onfinish(importlog) {
    return utils.finalizarContadoresImportacao(importlog);
  }

  return {
    'onrecord': onrecord,
    'onfinish': onfinish
  };
})();
