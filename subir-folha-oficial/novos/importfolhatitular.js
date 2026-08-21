/*
 * ImportFolhaTitular
 * durr.main.dev.integracao.importfolhatitular
 *
 */
module.exports = (function () {
  'use strict';
  var logger = logging.withLogger('durr.main.dev.integracao.importfolhatitular');
  var src = require('plusoftcrm.libs.main.source')({
    'utilsImportFolha': 'durr.main.dev.integracao.utilsimportfolha',
    'businessImportFolha': 'durr.main.dev.integracao.businessImportFolha'
  });
  var utils = src.require('utilsImportFolha');

  var COL = {
    EMPRESA: 0,
    MATRICULA: 1,
    CPF: 2,
    NOME: 3,
    DATA_NASCIMENTO: 4,
    SEXO: 5,
    ESTADO_CIVIL: 6,
    NOME_MAE: 7,
    NOME_PAI: 8,
    PIS: 9,
    CTPS: 10,
    VINCULO_CODIGO: 11,
    VINCULO_NOME: 12,
    FUNCAO_CODIGO: 13,
    FUNCAO_NOME: 14,
    IDENTIDADE: 15,
    SITUACAO: 16,
    SINDICATO_CODIGO: 17,
    SINDICATO_RAZAO_SOCIAL: 18,
    CATEGORIA_PROFISSIONAL_CODIGO: 19,
    CATEGORIA_PROFISSIONAL_NOME: 20,
    DATA_ADMISSAO: 21,
    EMAIL: 22,
    LOGRADOURO: 23,
    NUMERO: 24,
    COMPLEMENTO: 25,
    BAIRRO: 26,
    CEP: 27,
    MUNICIPIO_NOME: 28,
    UF: 29,
    BANCO_NOME: 30,
    BANCO_CODIGO_BACEN: 31
  };

  // A quantidade física de colunas varia por linha (POI só grava células até a
  // última preenchida); posições ausentes são tratadas como vazio, nunca undefined.
  function obterColuna(colunas, indice) {
    return colunas && colunas.length > indice ? colunas[indice] : null;
  }

  // Categoria Profissional - Cód é o código de folha do sindicato no layout oficial
  // DURR; Sindicato - Código e Categoria Profissional - Nome são ignorados.
  function montarTitular(colunas) {
    return {
      CodigoEmpresa: obterColuna(colunas, COL.EMPRESA),
      MatriculaColaborador: obterColuna(colunas, COL.MATRICULA),
      CPF: obterColuna(colunas, COL.CPF),
      NomeCompletoColaborador: obterColuna(colunas, COL.NOME),
      NomeSocialColaborador: obterColuna(colunas, COL.NOME),
      DataNascimento: utils.converterDataOficial(obterColuna(colunas, COL.DATA_NASCIMENTO)),
      Sexo: obterColuna(colunas, COL.SEXO),
      EstadoCivil: obterColuna(colunas, COL.ESTADO_CIVIL),
      NomeMae: obterColuna(colunas, COL.NOME_MAE),
      NomePai: obterColuna(colunas, COL.NOME_PAI),
      CodigoVinculoEmpregaticio: obterColuna(colunas, COL.VINCULO_CODIGO),
      VinculoNome: obterColuna(colunas, COL.VINCULO_NOME),
      CodigoCargo: obterColuna(colunas, COL.FUNCAO_CODIGO),
      Cargo: obterColuna(colunas, COL.FUNCAO_NOME),
      RG: obterColuna(colunas, COL.IDENTIDADE),
      SituacaoColaborador: obterColuna(colunas, COL.SITUACAO),
      CodigoSindicato: obterColuna(colunas, COL.CATEGORIA_PROFISSIONAL_CODIGO),
      Sindicato: obterColuna(colunas, COL.SINDICATO_RAZAO_SOCIAL),
      DataAdmissao: utils.converterDataOficial(obterColuna(colunas, COL.DATA_ADMISSAO)),
      EmailCorporativo: obterColuna(colunas, COL.EMAIL),
      CEPPessoal: obterColuna(colunas, COL.CEP),
      LogradouroPessoal: obterColuna(colunas, COL.LOGRADOURO),
      NumeroPessoal: obterColuna(colunas, COL.NUMERO),
      ComplementoPessoal: obterColuna(colunas, COL.COMPLEMENTO),
      BairroPessoal: obterColuna(colunas, COL.BAIRRO),
      CidadePessoal: obterColuna(colunas, COL.MUNICIPIO_NOME),
      UFPessoal: obterColuna(colunas, COL.UF),
      Banco: obterColuna(colunas, COL.BANCO_CODIGO_BACEN),
      NomeBanco: obterColuna(colunas, COL.BANCO_NOME),
      Dependentes: []
    };
  }

  function contexto(colunas) {
    return [
      { label: 'Empresa', valor: obterColuna(colunas, COL.EMPRESA) },
      { label: 'Matrícula', valor: obterColuna(colunas, COL.MATRICULA) },
      { label: 'CPF', valor: obterColuna(colunas, COL.CPF) },
      { label: 'Nome', valor: obterColuna(colunas, COL.NOME) }
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
    var titular = montarTitular(colunas);
    var resultado = src.require('businessImportFolha').processarColaborador(titular);

    resultado.avisos.forEach(function(aviso) {
      logger.warn(utils.formatarDiagnostico('TITULAR', 'AVISO', aviso, contexto(colunas)));
    });

    if (!resultado.sucesso) {
      var mensagem = utils.formatarDiagnostico('TITULAR', statusFalha(resultado.mensagens), resultado.mensagens.join(' | '), contexto(colunas));
      throw src.new('UserException')(mensagem);
    }

    logger.info(utils.formatarDiagnostico('TITULAR', acaoParaStatus(resultado.acao), resultado.mensagens.join(' | '), contexto(colunas)));
  }

  function onfinish(importlog) {
    return utils.finalizarContadoresImportacao(importlog);
  }

  return {
    'onrecord': onrecord,
    'onfinish': onfinish
  };
})();
