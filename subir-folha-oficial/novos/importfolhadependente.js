/*
 * ImportFolhaDependente
 * durr.main.dev.integracao.importfolhadependente
 *
 */
module.exports = (function () {
  'use strict';
  var logger = logging.withLogger('durr.main.dev.integracao.importfolhadependente');
  var src = require('plusoftcrm.libs.main.source')({
    'utilsImportFolha': 'durr.main.dev.integracao.utilsimportfolha',
    'businessImportFolha': 'durr.main.dev.integracao.businessImportFolha'
  });
  var utils = src.require('utilsImportFolha');

  var COL = {
    EMPRESA: 0,
    MATRICULA_TITULAR: 1,
    NOME_TITULAR: 2,
    CPF_TITULAR: 3,
    PARENTESCO_CODIGO: 4,
    PARENTESCO_NOME: 5,
    CPF_DEPENDENTE: 6,
    NOME_DEPENDENTE: 7,
    DATA_NASCIMENTO_DEPENDENTE: 8,
    SEXO_DEPENDENTE: 9,
    NOME_MAE_DEPENDENTE: 10
  };

  // A quantidade física de colunas varia por linha (ex.: Nome da Mãe vazio no fim
  // da linha); posições ausentes são tratadas como vazio, nunca undefined.
  function obterColuna(colunas, indice) {
    return colunas && colunas.length > indice ? colunas[indice] : null;
  }

  function montarDependente(colunas) {
    return {
      CodigoEmpresa: obterColuna(colunas, COL.EMPRESA),
      MatriculaTitular: obterColuna(colunas, COL.MATRICULA_TITULAR),
      CPFTitular: obterColuna(colunas, COL.CPF_TITULAR),
      Nome: obterColuna(colunas, COL.NOME_DEPENDENTE),
      CPF: obterColuna(colunas, COL.CPF_DEPENDENTE),
      DataNascimento: utils.converterDataOficial(obterColuna(colunas, COL.DATA_NASCIMENTO_DEPENDENTE)),
      Sexo: obterColuna(colunas, COL.SEXO_DEPENDENTE),
      CodigoGrauParentesco: obterColuna(colunas, COL.PARENTESCO_CODIGO),
      GrauParentesco: obterColuna(colunas, COL.PARENTESCO_NOME)
    };
  }

  function contexto(colunas) {
    return [
      { label: 'Empresa', valor: obterColuna(colunas, COL.EMPRESA) },
      { label: 'Matrícula titular', valor: obterColuna(colunas, COL.MATRICULA_TITULAR) },
      { label: 'CPF titular', valor: obterColuna(colunas, COL.CPF_TITULAR) },
      { label: 'Nome titular', valor: obterColuna(colunas, COL.NOME_TITULAR) },
      { label: 'CPF dependente', valor: obterColuna(colunas, COL.CPF_DEPENDENTE) },
      { label: 'Nome dependente', valor: obterColuna(colunas, COL.NOME_DEPENDENTE) },
      { label: 'Parentesco', valor: obterColuna(colunas, COL.PARENTESCO_NOME) },
      { label: 'Data nascimento', valor: obterColuna(colunas, COL.DATA_NASCIMENTO_DEPENDENTE) }
    ];
  }

  function statusFalha(mensagens) {
    var texto = mensagens.join(' | ');
    return /^Erro ao processar/.test(texto) ? 'ERRO' : 'NAO_PROCESSADO';
  }

  function acaoParaStatus(acao) {
    if (acao === 'criado') return 'CRIADO';
    if (acao === 'atualizado') return 'ATUALIZADO';
    return 'SEM_ALTERACAO';
  }

  function onrecord(to, importto, lineNumber) {
    var colunas = to.columns || [];
    var dependente = montarDependente(colunas);
    var resultado = src.require('businessImportFolha').processarDependenteAvulso(dependente);

    resultado.avisos.forEach(function(aviso) {
      logger.warn(utils.formatarDiagnostico('DEPENDENTE', 'AVISO', aviso, contexto(colunas)));
    });

    if (!resultado.sucesso) {
      var mensagem = utils.formatarDiagnostico('DEPENDENTE', statusFalha(resultado.mensagens), resultado.mensagens.join(' | '), contexto(colunas));
      throw src.new('UserException')(mensagem);
    }

    logger.info(utils.formatarDiagnostico('DEPENDENTE', acaoParaStatus(resultado.acao), resultado.mensagens.join(' | '), contexto(colunas)));
  }

  function onfinish(importlog) {
    return utils.finalizarContadoresImportacao(importlog);
  }

  return {
    'onrecord': onrecord,
    'onfinish': onfinish
  };
})();
