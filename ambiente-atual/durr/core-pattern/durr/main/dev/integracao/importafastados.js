/*
 * ImportAfastados
 * durr.main.dev.integracao.importafastados
 *
 */
module.exports = (function () {
  'use strict';
  var logger = logging.withLogger('durr.main.dev.integracao.importafastados');
  var src = require('plusoftcrm.libs.main.source')({
    'businessImportAfastados': 'durr.main.dev.integracao.businessImportAfastados'
  });

  var col = {
    empresa: 0,
    codigo_estabelecimento: 1,
    descricao_estabelecimento: 2,
    matricula: 3,
    nome: 4,
    funcao: 5,
    centro_resultado: 6,
    descricao_centro_resultado: 7,
    numero_dias: 8,
    data_admissao: 9,
    data_afastamento: 10,
    data_retorno: 11,
    tipo_afastamento: 12,
    motivo_interno: 13,
    data_previsao_pericia_inss: 14,
    protocolo_agendamento_pericia: 15,
    numero_beneficio: 16
  };

  function montarAfastamento(to) {
    return {
      Empresa: to.columns[col.empresa],
      CodigoEstabelecimento: to.columns[col.codigo_estabelecimento],
      Matricula: to.columns[col.matricula],
      Nome: to.columns[col.nome],
      NumeroDias: to.columns[col.numero_dias],
      DataAfastamento: to.columns[col.data_afastamento],
      DataRetorno: to.columns[col.data_retorno],
      TipoAfastamento: to.columns[col.tipo_afastamento]
    };
  }

  function onrecord(to) {
    var afastamento = montarAfastamento(to);
    var resultado = require('durr.main.dev.integracao.businessImportAfastados').processarAfastamento(afastamento);

    if (resultado.avisos && resultado.avisos.length > 0) {
      logger.warn('[importafastados][onrecord] Avisos na matrícula ' + afastamento.Matricula + ': ' + resultado.avisos.join(' | '));
    }
    if (!resultado.sucesso) {
      throw src.new('UserException')(resultado.mensagens.join(' | '));
    }
  }

  function onfinish(importlog) {
    return importlog;
  }

  return {
    'onrecord': onrecord,
    'onfinish': onfinish
  };
})();
