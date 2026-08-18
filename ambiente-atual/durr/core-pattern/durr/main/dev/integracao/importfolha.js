/*
 * ImportFolha
 * durr.main.dev.integracao.importfolha
 *
 */
module.exports = (function () {
  'use strict';
  var logger = logging.withLogger('durr.main.dev.integracao.importfolha');
  var src = require('plusoftcrm.libs.main.source')({
    'utilsImportFolha': 'durr.main.dev.integracao.utilsimportfolha'
  });
  var utils = src.require('utilsImportFolha');

  var col = {
    codigo_folha_empresa: 0,
    empresa_razao_social: 1,
    matricula: 2,
    cpf: 3,
    grau_parentesco: 4,
    codigo_grau_parentesco: 5,
    cpf_dependente: 6,
    nome_colaborador: 7,
    data_nascimento_colaborador: 8,
    sexo_colaborador: 9,
    nome_dependente: 10,
    data_nascimento_dependente: 11,
    sexo_dependente: 12,
    estado_civil_colaborador: 13,
    nome_da_mae_colaborador: 14,
    nome_do_pai_colaborador: 15,
    pis: 16,
    ctps: 17,
    codigo_tipo_vinculo_empregaticio: 18,
    tipo_vinculo_empregaticio: 19,
    codigo_folha_cargo: 20,
    cargo: 21,
    identidade: 22,
    situacao_colaborador: 23,
    codigo_folha_sindicato: 24,
    sindicato: 25,
    data_admissao: 26,
    email: 27,
    cep: 28,
    logradouro: 29,
    logradouro_numero: 30,
    complemento: 31,
    bairro: 32,
    cidade: 33,
    estado: 34,
    numero_banco: 35,
    nome_banco: 36
  };

  function montarColaborador(to) {
    return {
      /* TODO: pegar grupo econômico cadastrado */
      CodigoGrupoEconomico: null,
      CodigoEmpresa: to.columns[col.codigo_folha_empresa],
      MatriculaColaborador: to.columns[col.matricula],
      CPF: to.columns[col.cpf],
      NomeCompletoColaborador: to.columns[col.nome_colaborador],
      NomeSocialColaborador: to.columns[col.nome_colaborador],
      DataNascimento: utils.converterDataBr(to.columns[col.data_nascimento_colaborador]),
      Sexo: to.columns[col.sexo_colaborador],
      EstadoCivil: to.columns[col.estado_civil_colaborador],
      NomeMae: to.columns[col.nome_da_mae_colaborador],
      NomePai: to.columns[col.nome_do_pai_colaborador],
      CodigoVinculoEmpregaticio: to.columns[col.codigo_tipo_vinculo_empregaticio],
      CodigoCargo: to.columns[col.codigo_folha_cargo],
      Cargo: to.columns[col.cargo],
      RG: to.columns[col.identidade],
      SituacaoColaborador: to.columns[col.situacao_colaborador],
      CodigoSindicato: to.columns[col.codigo_folha_sindicato],
      Sindicato: to.columns[col.sindicato],
      DataAdmissao: utils.converterDataBr(to.columns[col.data_admissao]),
      EmailCorporativo: to.columns[col.email],
      EmailPessoal: null,
      CEPPessoal: to.columns[col.cep],
      LogradouroPessoal: to.columns[col.logradouro],
      NumeroPessoal: to.columns[col.logradouro_numero],
      ComplementoPessoal: to.columns[col.complemento],
      BairroPessoal: to.columns[col.bairro],
      CidadePessoal: to.columns[col.cidade],
      UFPessoal: to.columns[col.estado],
      Banco: to.columns[col.numero_banco],
      NomeBanco: to.columns[col.nome_banco],
      Dependentes: [{
        Nome: to.columns[col.nome_dependente],
        CPF: to.columns[col.cpf_dependente],
        DataNascimento: utils.converterDataBr(to.columns[col.data_nascimento_dependente]),
        Sexo: to.columns[col.sexo_dependente],
        GrauParentesco: to.columns[col.grau_parentesco],
        CodigoGrauParentesco: to.columns[col.codigo_grau_parentesco]
      }]      
    };
  }

  function onrecord(to) {
    logger.error('TO', JSON.stringify(to));

    var colaborador = montarColaborador(to);
    var resultado = require('durr.main.dev.integracao.businessImportFolha').processarColaborador(colaborador);

    if (resultado.avisos && resultado.avisos.length > 0) {
      logger.warn('[importfolha][onrecord] Avisos na matrícula ' + colaborador.MatriculaColaborador + ': ' + resultado.avisos.join(' | '));
    }
    if (!resultado.sucesso) {
      throw src.new('UserException')(resultado.mensagens.join(' | '));
    }
  }

  // Inicia as validações de elegibilidade após o término da importação.
  function onfinish(importlog) {
    //iniciarValidacaoElegibilidade('inpaas.scheduler.validarElegibilidadeSeguravel');
    //iniciarValidacaoElegibilidade('inpaas.scheduler.validarElegibilidadeNaoSeguravel');
  }

  function iniciarValidacaoElegibilidade(dsKey) {
    try {
      var task = require('inpaas.scheduler.services.task').findAll(false, { key: dsKey })[0];
      if (!task) {
        logger.error('[cadastro.vida][onfinish] Task nao encontrada: ' + dsKey);
        return;
      }
      require('inpaas.scheduler.services.tasklog').createExecution({
        id: task.id,
        user: task.user,
        mode: 'A'
      });
    } catch (e) {
      logger.error('[cadastro.vida][onfinish] Falha ao iniciar ' + dsKey + ': ' + e);
    }
  }
  return {
    'onrecord': onrecord,
    'onfinish': onfinish
  };
})();