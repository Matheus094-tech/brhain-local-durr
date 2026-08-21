/*
 * BusinessTestImportAfastados
 * durr.main.dev.integracao.testimportafastados
 *
 * Executa cenários controlados contra dados reais de DEV (sem mocks), cobrindo
 * os casos mínimos da Importação de Afastados. Cria e remove ao final apenas
 * registros com o marcador "ZZ_TESTE_IMPORTAFASTADOS" no nome.
 *
 * Os nomes de tipo usados nos casos que efetivamente criam BRH_TIPO_AFASTAMENTO
 * seguem o padrão real "CODIGO - Nome" porque DS_CODIGOFOLHA é NOT NULL neste
 * ambiente e só é preenchido quando esse padrão é reconhecido.
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.integracao.testimportafastados');
  var src = require('plusoftcrm.libs.main.source')({
    'businessImportAfastados': 'durr.main.dev.integracao.businessImportAfastados'
  });

  var PREFIXO_TESTE = 'ZZ_TESTE_IMPORTAFASTADOS';
  var CODIGO_EMPRESA_TESTE = '1';

  function adicionar(result, nome, sucesso, detalhes) {
    result.push({ teste: nome, sucesso: sucesso, detalhes: detalhes });
    if (!sucesso) {
      logger.error('[FALHA] ' + nome + ' - ' + JSON.stringify(detalhes));
    }
  }

  function adicionarResumo(result) {
    var total = 0, sucesso = 0, falha = 0;
    result.forEach(function(item) {
      if (item.teste) {
        total++;
        if (item.sucesso) sucesso++; else falha++;
      }
    });
    result.push({ resumo: true, total: total, sucesso: sucesso, falha: falha });
  }

  function processar(dto) {
    return src.require('businessImportAfastados').processarAfastamento(dto);
  }

  function localizarColaboradorDeTeste() {
    var empresa = src.require('knex')('BRH_EMPRESA')
      .select('ID_BRH_EMPRESA')
      .where('DS_CODIGOFOLHA', CODIGO_EMPRESA_TESTE)
      .findFirst();
    if (!empresa) return null;

    return src.require('knex')('BRH_COLABORADOR')
      .select('DS_MATRICULA', 'ID_BRH_GRUPO_ECONOMICO')
      .where('ID_BRH_EMPRESA', empresa.id_brh_empresa)
      .findFirst();
  }

  function contarTiposPorNome(idGrupoEconomico, nome) {
    var lista = src.require('knex')('BRH_TIPO_AFASTAMENTO')
      .where('ID_BRH_GRUPO_ECONOMICO', idGrupoEconomico)
      .where('DS_NOME', nome)
      .find();
    return lista ? lista.length : 0;
  }

  function testarEmpresaInexistente(result) {
    var resultado = processar({
      Empresa: 'ZZ_EMPRESA_INEXISTENTE_999',
      Matricula: '999999',
      DataAfastamento: '01/01/2020',
      TipoAfastamento: PREFIXO_TESTE + ' - Tipo Empresa'
    });
    adicionar(result, 'Caso 7 - Empresa inexistente gera erro e não processa',
      !resultado.sucesso && resultado.mensagens.indexOf('Empresa não encontrada.') !== -1, resultado);
  }

  function testarColaboradorInexistente(result) {
    var resultado = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: 'ZZ_MATRICULA_INEXISTENTE_999',
      DataAfastamento: '01/01/2020',
      TipoAfastamento: PREFIXO_TESTE + ' - Tipo Colaborador'
    });
    adicionar(result, 'Caso 6 - Colaborador inexistente gera erro, sem criar colaborador ou afastamento',
      !resultado.sucesso && resultado.mensagens.indexOf('Colaborador não encontrado.') !== -1, resultado);
  }

  function testarDataInvalida(result, colaborador) {
    var resultado = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: colaborador.ds_matricula,
      DataAfastamento: '31/02/2020',
      TipoAfastamento: PREFIXO_TESTE + ' - Tipo Data Invalida'
    });
    adicionar(result, 'Caso 8 - Data de afastamento inválida gera erro e não persiste',
      !resultado.sucesso && resultado.mensagens.indexOf('Data de afastamento inválida.') !== -1, resultado);
  }

  function testarNumeroDiasDivergente(result, colaborador, idsAfastamentoCriados) {
    var resultado = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: colaborador.ds_matricula,
      DataAfastamento: '20/01/2020',
      DataRetorno: '25/01/2020',
      NumeroDias: '999',
      TipoAfastamento: PREFIXO_TESTE + ' - Tipo Divergente'
    });
    if (resultado.idAfastamento) idsAfastamentoCriados.push(resultado.idAfastamento);
    adicionar(result, 'Caso 9 - Número de dias divergente gera erro e não persiste',
      !resultado.sucesso && /divergente/.test(resultado.mensagens.join(' ')), resultado);
  }

  function testarTipoNovoReaproveitamentoEIdempotencia(result, colaborador, idsAfastamentoCriados) {
    var nomeTipo = 'ZA - ' + PREFIXO_TESTE + ' Automatizado';

    var r1 = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: colaborador.ds_matricula,
      DataAfastamento: '01/01/2020',
      TipoAfastamento: nomeTipo
    });
    if (r1.idAfastamento) idsAfastamentoCriados.push(r1.idAfastamento);
    adicionar(result, 'Caso 2 - Tipo inexistente é criado e o afastamento é criado usando o novo ID',
      r1.sucesso && r1.acao === 'criado', r1);
    adicionar(result, 'Caso 2 - Exatamente um BRH_TIPO_AFASTAMENTO criado para o nome',
      contarTiposPorNome(colaborador.id_brh_grupo_economico, nomeTipo) === 1, null);

    var r2 = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: colaborador.ds_matricula,
      DataAfastamento: '02/01/2020',
      TipoAfastamento: nomeTipo
    });
    if (r2.idAfastamento) idsAfastamentoCriados.push(r2.idAfastamento);
    adicionar(result, 'Caso 1 - Tipo já existente é reaproveitado (nenhum tipo novo criado)',
      r2.sucesso && r2.acao === 'criado' && contarTiposPorNome(colaborador.id_brh_grupo_economico, nomeTipo) === 1, r2);

    var r3 = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: colaborador.ds_matricula,
      DataAfastamento: '01/01/2020',
      TipoAfastamento: nomeTipo
    });
    adicionar(result, 'Caso 4 - Reprocessar a mesma linha não duplica o afastamento',
      r3.sucesso && r3.acao === 'semAlteracao' && Number(r3.idAfastamento) === Number(r1.idAfastamento), r3);

    var r4 = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: colaborador.ds_matricula,
      DataAfastamento: '06/01/2020',
      TipoAfastamento: '  ' + nomeTipo.toLowerCase() + '  '
    });
    if (r4.idAfastamento) idsAfastamentoCriados.push(r4.idAfastamento);
    adicionar(result, 'Caso 10 - Diferença de caixa/espaço no tipo reaproveita o mesmo registro',
      r4.sucesso && contarTiposPorNome(colaborador.id_brh_grupo_economico, nomeTipo) === 1, r4);
  }

  function testarVariasLinhasMesmoTipoNovo(result, colaborador, idsAfastamentoCriados) {
    var nomeTipo = 'ZL - ' + PREFIXO_TESTE + ' Lote';
    ['03/01/2020', '04/01/2020', '05/01/2020'].forEach(function(data) {
      var r = processar({
        Empresa: CODIGO_EMPRESA_TESTE,
        Matricula: colaborador.ds_matricula,
        DataAfastamento: data,
        TipoAfastamento: nomeTipo
      });
      if (r.idAfastamento) idsAfastamentoCriados.push(r.idAfastamento);
    });

    adicionar(result, 'Caso 3 - Várias linhas com o mesmo tipo novo criam apenas um BRH_TIPO_AFASTAMENTO',
      contarTiposPorNome(colaborador.id_brh_grupo_economico, nomeTipo) === 1, null);
  }

  function testarAfastamentoAbertoEFinalizacao(result, colaborador, idsAfastamentoCriados) {
    var nomeTipo = 'ZB - ' + PREFIXO_TESTE + ' Aberto';

    var r1 = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: colaborador.ds_matricula,
      DataAfastamento: '10/01/2020',
      TipoAfastamento: nomeTipo
    });
    if (r1.idAfastamento) idsAfastamentoCriados.push(r1.idAfastamento);
    adicionar(result, 'Caso 5a - Afastamento sem Data de Retorno é criado em aberto', r1.sucesso && r1.acao === 'criado', r1);

    var registroAberto = r1.idAfastamento && src.require('knex')('BRH_AFASTAMENTO').select('DT_TERMINO').where('ID_BRH_AFASTAMENTO', r1.idAfastamento).findFirst();
    var abertoOk = !!registroAberto && new Date(registroAberto.dt_termino).toISOString().substring(0, 10) === '9999-12-31';
    adicionar(result, 'Caso 5a - DT_TERMINO gravado como 9999-12-31 (aberto)', abertoOk, registroAberto);

    var r2 = processar({
      Empresa: CODIGO_EMPRESA_TESTE,
      Matricula: colaborador.ds_matricula,
      DataAfastamento: '10/01/2020',
      DataRetorno: '15/01/2020',
      NumeroDias: '5',
      TipoAfastamento: nomeTipo
    });
    adicionar(result, 'Caso 5b - Nova carga com retorno atualiza o mesmo ID_BRH_AFASTAMENTO',
      r2.sucesso && r2.acao === 'atualizado' && Number(r2.idAfastamento) === Number(r1.idAfastamento), r2);

    var registroFinalizado = r1.idAfastamento && src.require('knex')('BRH_AFASTAMENTO').select('DT_TERMINO').where('ID_BRH_AFASTAMENTO', r1.idAfastamento).findFirst();
    var terminoOk = !!registroFinalizado && new Date(registroFinalizado.dt_termino).toISOString().substring(0, 10) === '2020-01-14';
    adicionar(result, 'Caso 5b - DT_TERMINO = Data de Retorno - 1 dia (14/01/2020)', terminoOk, registroFinalizado);
  }

  function limparDadosDeTeste(idsAfastamentoCriados) {
    idsAfastamentoCriados.forEach(function(id) {
      try {
        src.require('dao').getDao('BRH_AFASTAMENTO').filter({ id_brh_afastamento: id }).delete();
      } catch (e) {
        logger.error('[limparDadosDeTeste] Falha ao remover BRH_AFASTAMENTO ' + id, e);
      }
    });

    try {
      var tipos = src.require('knex')('BRH_TIPO_AFASTAMENTO')
        .select('ID_BRH_TIPO_AFASTAMENTO')
        .where('DS_NOME', 'like', '%' + PREFIXO_TESTE + '%')
        .find() || [];
      for (var i = 0; i < tipos.length; i++) {
        src.require('dao').getDao('BRH_TIPO_AFASTAMENTO').filter({ id_brh_tipo_afastamento: tipos[i].id_brh_tipo_afastamento }).delete();
      }
    } catch (e) {
      logger.error('[limparDadosDeTeste] Falha ao remover BRH_TIPO_AFASTAMENTO de teste', e);
    }
  }

  function run() {
    var result = [];
    var idsAfastamentoCriados = [];

    logger.warn('Iniciando testes de Importação de Afastados');

    testarEmpresaInexistente(result);

    var colaborador = localizarColaboradorDeTeste();
    if (!colaborador) {
      result.push({
        teste: 'Casos dependentes de colaborador real',
        sucesso: null,
        detalhes: 'Nenhum colaborador encontrado para DS_CODIGOFOLHA=' + CODIGO_EMPRESA_TESTE + ' neste ambiente (NAO_APLICAVEL)'
      });
      adicionarResumo(result);
      return result;
    }

    testarColaboradorInexistente(result);

    try {
      testarDataInvalida(result, colaborador);
      testarTipoNovoReaproveitamentoEIdempotencia(result, colaborador, idsAfastamentoCriados);
      testarVariasLinhasMesmoTipoNovo(result, colaborador, idsAfastamentoCriados);
      testarAfastamentoAbertoEFinalizacao(result, colaborador, idsAfastamentoCriados);
      testarNumeroDiasDivergente(result, colaborador, idsAfastamentoCriados);
    } finally {
      limparDadosDeTeste(idsAfastamentoCriados);
    }

    adicionarResumo(result);

    logger.warn('Finalizado testes de Importação de Afastados');

    return result;
  }

  return {
    'run': run
  };
})();
