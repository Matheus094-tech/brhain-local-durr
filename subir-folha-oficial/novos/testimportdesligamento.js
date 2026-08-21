/*
 * BusinessTestImportDesligamento
 * durr.main.dev.integracao.testimportdesligamento
 *
 * Executa cenários controlados contra dados reais de DEV (sem mocks), cobrindo
 * os casos mínimos de Folha - Desligamento. Cria o próprio titular de teste
 * (matrícula marcada) via BusinessImportFolha e remove tudo ao final.
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.integracao.testimportdesligamento');
  var src = require('plusoftcrm.libs.main.source')({
    'businessImportFolha': 'durr.main.dev.integracao.businessImportFolha',
    'businessImportDesligamento': 'durr.main.dev.integracao.businessImportDesligamento',
    'utilsImportFolha': 'durr.main.dev.integracao.utilsimportfolha'
  });
  var utils = src.require('utilsImportFolha');

  var PREFIXO_TESTE = 'ZZ_TESTE_IMPORTDESLIGAMENTO';
  var CODIGO_EMPRESA_TESTE = '1';
  var MATRICULA_TITULAR = PREFIXO_TESTE + '_TITULAR';
  var CPF_TITULAR = '5566778899';
  var TIPO_EVENTO_CODIGO_TECNICO = 'DESLIGAMENTO';
  var TIPO_EVENTO_CODIGO_DECOY = 'ZDT_OUTRO';

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
    return src.require('businessImportDesligamento').processarDesligamento(dto);
  }

  function empresaTesteExiste() {
    var empresa = src.require('knex')('BRH_EMPRESA').select('ID_BRH_EMPRESA').where('DS_CODIGOFOLHA', CODIGO_EMPRESA_TESTE).findFirst();
    return !!empresa;
  }

  function criarTitularDeTeste() {
    var dtoTitular = {
      CodigoEmpresa: CODIGO_EMPRESA_TESTE,
      MatriculaColaborador: MATRICULA_TITULAR,
      CPF: CPF_TITULAR,
      NomeCompletoColaborador: PREFIXO_TESTE + ' Titular',
      // BusinessImportFolha espera data já convertida (quem converte é ImportFolha
      // no fluxo real); reproduzido aqui porque o teste chama o núcleo direto.
      DataNascimento: utils.converterDataOficial('29682'),
      Sexo: 'Masculino',
      NomeMae: PREFIXO_TESTE + ' Mae',
      CodigoVinculoEmpregaticio: 'ZDV1',
      VinculoNome: PREFIXO_TESTE + ' Vinculo',
      CodigoCargo: 'ZDC1',
      Cargo: PREFIXO_TESTE + ' Cargo',
      SituacaoColaborador: 'ATIVO',
      DataAdmissao: utils.converterDataOficial('45749')
    };
    return src.require('businessImportFolha').processarColaborador(dtoTitular);
  }

  function buscarColaborador() {
    var empresa = src.require('knex')('BRH_EMPRESA').select('ID_BRH_EMPRESA').where('DS_CODIGOFOLHA', CODIGO_EMPRESA_TESTE).findFirst();
    if (!empresa) return null;
    return src.require('knex')('BRH_COLABORADOR')
      .select('ID_BRH_COLABORADOR', 'DT_DESLIGAMENTO', 'ID_BRH_MOTIVO_EVENTO', 'ID_BRH_TIPO_EVENTO', 'ID_BRH_SITUACAO_COLABORADOR')
      .where('ID_BRH_EMPRESA', empresa.id_brh_empresa)
      .where('DS_MATRICULA', MATRICULA_TITULAR)
      .findFirst();
  }

  function contarMotivoPorCodigo(codigo) {
    var lista = src.require('knex')('BRH_MOTIVO_EVENTO').select('ID_BRH_MOTIVO_EVENTO').where('DS_CODIGOFOLHA', codigo).find();
    return lista ? lista.length : 0;
  }

  function buscarMotivoPorCodigoETipo(codigo, idTipoEvento) {
    return src.require('knex')('BRH_MOTIVO_EVENTO')
      .select('ID_BRH_MOTIVO_EVENTO', 'ID_BRH_TIPO_EVENTO', 'DS_NOME')
      .where('DS_CODIGOFOLHA', codigo)
      .where('ID_BRH_TIPO_EVENTO', idTipoEvento)
      .findFirst();
  }

  function buscarTipoEventoDesligamento() {
    return src.require('knex')('BRH_TIPO_EVENTO')
      .select('ID_BRH_TIPO_EVENTO', 'DS_NOME', 'DS_CODIGOFOLHA', 'ID_BRH_GRUPO_ECONOMICO')
      .where('DS_CODIGOFOLHA', TIPO_EVENTO_CODIGO_TECNICO)
      .findFirst();
  }

  function contarTipoEventoPorCodigo(codigo) {
    var lista = src.require('knex')('BRH_TIPO_EVENTO').select('ID_BRH_TIPO_EVENTO').where('DS_CODIGOFOLHA', codigo).find();
    return lista ? lista.length : 0;
  }

  function buscarSituacaoDemitido() {
    return src.require('knex')('BRH_SITUACAO_COLABORADOR')
      .select('ID_BRH_SITUACAO_COLABORADOR', 'OP_TIPO')
      .where('DS_CODIGOFOLHA', 'Demitido')
      .findFirst();
  }

  function contarHistoricoDesligamento(idColaborador) {
    var lista = src.require('knex')('BRH_ELEGIBILIDADE_HISTORICO')
      .select('ID_BRH_ELEGIBILIDADE_HISTORICO')
      .where('ID_BRH_COLABORADOR', idColaborador)
      .where('DS_EVENTO', 'Desligamento')
      .find();
    return lista ? lista.length : 0;
  }

  function dtoDesligamentoBase() {
    return {
      CodigoEmpresa: CODIGO_EMPRESA_TESTE,
      Matricula: MATRICULA_TITULAR,
      Nome: PREFIXO_TESTE + ' Titular',
      CPF: CPF_TITULAR,
      DataDesligamento: '45749', // serial Excel real (02/04/2025)
      MotivoCodigo: 'ZDM1',
      MotivoNome: PREFIXO_TESTE + ' Motivo'
    };
  }

  function testarEmpresaInexistente(result) {
    var dto = dtoDesligamentoBase();
    dto.CodigoEmpresa = 'ZZ_EMPRESA_INEXISTENTE_999';
    var r = processar(dto);
    adicionar(result, 'Desligamento - Empresa inexistente gera erro', !r.sucesso && /Empresa/.test(r.mensagens.join(' ')), r);
  }

  function testarColaboradorInexistente(result) {
    var dto = dtoDesligamentoBase();
    dto.Matricula = 'ZZ_MATRICULA_INEXISTENTE_999';
    var r = processar(dto);
    adicionar(result, 'Desligamento - Colaborador inexistente gera erro', !r.sucesso && /Colaborador não encontrado/.test(r.mensagens.join(' ')), r);
  }

  function testarFluxoCompleto(result) {
    if (!empresaTesteExiste()) {
      result.push({ teste: 'Casos de Desligamento', sucesso: null, detalhes: 'NAO_APLICAVEL: empresa DS_CODIGOFOLHA=' + CODIGO_EMPRESA_TESTE + ' não encontrada neste ambiente' });
      return null;
    }

    var criacao = criarTitularDeTeste();
    if (!criacao.sucesso) {
      adicionar(result, 'Pré-condição - criação do titular de teste', false, criacao);
      return null;
    }

    // (E) Decoy: já existe um Motivo com o MESMO código 'ZDM1' ligado a OUTRO Tipo
    // Evento — a rotina não pode reaproveitar nem sobrescrever esse vínculo.
    var tipoEventoDecoy = { id_brh_grupo_economico: src.require('businessImportFolha').obterIdGrupoEconomico(), ds_codigofolha: TIPO_EVENTO_CODIGO_DECOY, ds_nome: PREFIXO_TESTE + ' Tipo Evento Outro' };
    src.require('dao').getDao('BRH_TIPO_EVENTO').insert(tipoEventoDecoy);
    var motivoDecoy = { id_brh_tipo_evento: tipoEventoDecoy.id_brh_tipo_evento, ds_codigofolha: 'ZDM1', ds_nome: PREFIXO_TESTE + ' Motivo Outro Tipo' };
    src.require('dao').getDao('BRH_MOTIVO_EVENTO').insert(motivoDecoy);

    // (A) Tipo Evento de Desligamento: cria se não existir, reutiliza se já existir —
    // em ambos os casos, exatamente 1 registro com o código técnico após o processamento.
    var r1 = processar(dtoDesligamentoBase());
    var tipoEventoDesligamento = buscarTipoEventoDesligamento();
    adicionar(result, 'Desligamento - Tipo de Evento de Desligamento resolvido (código técnico DESLIGAMENTO)',
      r1.sucesso && !!tipoEventoDesligamento && !!tipoEventoDesligamento.id_brh_grupo_economico, tipoEventoDesligamento);
    adicionar(result, 'Desligamento - Tipo de Evento de Desligamento existe exatamente 1x (criado ou reaproveitado, nunca duplicado)',
      contarTipoEventoPorCodigo(TIPO_EVENTO_CODIGO_TECNICO) === 1, null);

    // (E) Motivo criado para o código 'ZDM1' é um registro DIFERENTE do decoy, ligado
    // ao Tipo Evento de Desligamento correto — não reaproveitou nem sobrescreveu o outro.
    var motivoCorreto = buscarMotivoPorCodigoETipo('ZDM1', tipoEventoDesligamento.id_brh_tipo_evento);
    adicionar(result, 'Desligamento - Motivo código "ZDM1" criado dentro do Tipo Evento correto (não reaproveita motivo de outro Tipo)',
      !!motivoCorreto && Number(motivoCorreto.id_brh_motivo_evento) !== Number(motivoDecoy.id_brh_motivo_evento), { motivoCorreto: motivoCorreto, motivoDecoy: motivoDecoy });
    adicionar(result, 'Desligamento - código "ZDM1" existe 2x no total (decoy + correto), sem sobrescrever o decoy',
      contarMotivoPorCodigo('ZDM1') === 2, null);

    adicionar(result, 'Desligamento - Colaborador atualizado (DT_DESLIGAMENTO/ID_BRH_TIPO_EVENTO/ID_BRH_MOTIVO_EVENTO/ID_BRH_SITUACAO_COLABORADOR)', r1.sucesso && r1.acao === 'atualizado', r1);

    var registro = buscarColaborador();
    var dataOk = !!registro && new Date(registro.dt_desligamento).toISOString().substring(0, 10) === '2025-04-02';
    adicionar(result, 'Desligamento - DT_DESLIGAMENTO gravada com data correta (serial Excel)', dataOk, registro);
    adicionar(result, 'Desligamento - ID_BRH_TIPO_EVENTO preenchido com o Tipo Evento de Desligamento', !!registro && Number(registro.id_brh_tipo_evento) === Number(tipoEventoDesligamento.id_brh_tipo_evento), registro);
    adicionar(result, 'Desligamento - ID_BRH_MOTIVO_EVENTO preenchido com o motivo correto (não o decoy)', !!registro && Number(registro.id_brh_motivo_evento) === Number(motivoCorreto.id_brh_motivo_evento), registro);

    // (F) Situação "Demitido" resolvida via helper compartilhado, OP_TIPO='T'
    var situacaoDemitido = buscarSituacaoDemitido();
    adicionar(result, 'Desligamento - Situação "Demitido" resolvida/criada com OP_TIPO=T (helper compartilhado)',
      !!situacaoDemitido && situacaoDemitido.op_tipo === 'T', situacaoDemitido);
    adicionar(result, 'Desligamento - ID_BRH_SITUACAO_COLABORADOR do colaborador aponta para a Situação Demitido',
      !!registro && !!situacaoDemitido && Number(registro.id_brh_situacao_colaborador) === Number(situacaoDemitido.id_brh_situacao_colaborador), { registro: registro, situacaoDemitido: situacaoDemitido });

    var historico1 = contarHistoricoDesligamento(criacao.idColaborador);
    adicionar(result, 'Desligamento - BRH_ELEGIBILIDADE_HISTORICO criado com DS_EVENTO=Desligamento', historico1 === 1, null);

    // (B) Tipo Evento já existente é reutilizado (não duplica) + (G) reprocessamento idêntico
    var r2 = processar(dtoDesligamentoBase());
    adicionar(result, 'Desligamento - Reprocessamento idêntico não gera alteração (semAlteracao)', r2.sucesso && r2.acao === 'semAlteracao', r2);
    adicionar(result, 'Desligamento - Reprocessamento idêntico não duplica histórico', contarHistoricoDesligamento(criacao.idColaborador) === 1, null);
    adicionar(result, 'Desligamento - Tipo de Evento de Desligamento reutilizado no reprocessamento (sem duplicar)',
      contarTipoEventoPorCodigo(TIPO_EVENTO_CODIGO_TECNICO) === 1, null);
    // (D) Motivo código 'ZDM1' já existente no mesmo Tipo é reutilizado (sem duplicar)
    adicionar(result, 'Desligamento - Motivo "ZDM1" no Tipo Evento correto reutilizado no reprocessamento (sem duplicar)',
      contarMotivoPorCodigo('ZDM1') === 2, null);

    var dtoDataAlterada = dtoDesligamentoBase();
    dtoDataAlterada.DataDesligamento = '45750';
    dtoDataAlterada.MotivoNome = PREFIXO_TESTE + ' Motivo Nome Diferente';
    var r3 = processar(dtoDataAlterada);
    adicionar(result, 'Desligamento - Alteração real de data gera novo histórico e reaproveita motivo existente',
      r3.sucesso && r3.acao === 'atualizado' && contarMotivoPorCodigo('ZDM1') === 2, r3);
    adicionar(result, 'Desligamento - Alteração real cria um segundo histórico (não sobrescreve o anterior)',
      contarHistoricoDesligamento(criacao.idColaborador) === 2, null);
    adicionar(result, 'Desligamento - Mesmo código com nome diferente gera aviso (não duplica cadastro)',
      r3.avisos.some(function(a) { return /já cadastrado/.test(a); }), r3);

    // (H) Motivo DIFERENTE numa nova carga: atualiza o FK ID_BRH_MOTIVO_EVENTO corretamente
    var dtoMotivoDiferente = dtoDesligamentoBase();
    dtoMotivoDiferente.DataDesligamento = '45752';
    dtoMotivoDiferente.MotivoCodigo = 'ZDM2';
    dtoMotivoDiferente.MotivoNome = PREFIXO_TESTE + ' Motivo Dois';
    var r7 = processar(dtoMotivoDiferente);
    var registroAposMotivoDiferente = buscarColaborador();
    var motivoDois = buscarMotivoPorCodigoETipo('ZDM2', tipoEventoDesligamento.id_brh_tipo_evento);
    adicionar(result, 'Desligamento - Motivo diferente numa nova carga atualiza o FK ID_BRH_MOTIVO_EVENTO',
      r7.sucesso && r7.acao === 'atualizado' && !!motivoDois && !!registroAposMotivoDiferente &&
      Number(registroAposMotivoDiferente.id_brh_motivo_evento) === Number(motivoDois.id_brh_motivo_evento), { resultado: r7, registro: registroAposMotivoDiferente, motivoDois: motivoDois });

    var dtoCpfDivergente = dtoDesligamentoBase();
    dtoCpfDivergente.CPF = '11111111111';
    var r4 = processar(dtoCpfDivergente);
    adicionar(result, 'Desligamento - CPF divergente do cadastro gera erro', !r4.sucesso && /CPF divergente/.test(r4.mensagens.join(' ')), r4);

    var dtoSemMotivo = dtoDesligamentoBase();
    dtoSemMotivo.MotivoCodigo = '';
    var r5 = processar(dtoSemMotivo);
    adicionar(result, 'Desligamento - Código do motivo ausente gera erro', !r5.sucesso && /motivo/i.test(r5.mensagens.join(' ')), r5);

    var dtoVinculoDivergente = dtoDesligamentoBase();
    dtoVinculoDivergente.DataDesligamento = '45751';
    dtoVinculoDivergente.VinculoCodigo = 'ZDV_OUTRO';
    dtoVinculoDivergente.VinculoNome = PREFIXO_TESTE + ' Vinculo Outro';
    var r6 = processar(dtoVinculoDivergente);
    adicionar(result, 'Desligamento - Vínculo divergente gera aviso mas não bloqueia o desligamento',
      r6.sucesso && r6.avisos.some(function(a) { return /Vínculo/.test(a); }), r6);

    return criacao.idColaborador;
  }

  function limparDadosDeTeste(idColaborador) {
    try {
      if (idColaborador) {
        var historicos = src.require('knex')('BRH_ELEGIBILIDADE_HISTORICO')
          .select('ID_BRH_ELEGIBILIDADE_HISTORICO')
          .where('ID_BRH_COLABORADOR', idColaborador)
          .find() || [];
        for (var i = 0; i < historicos.length; i++) {
          src.require('dao').getDao('BRH_ELEGIBILIDADE_HISTORICO').filter({ id_brh_elegibilidade_historico: historicos[i].id_brh_elegibilidade_historico }).delete();
        }
        src.require('dao').getDao('BRH_COLABORADOR').filter({ id_brh_colaborador: idColaborador }).delete();
      }
    } catch (e) {
      logger.error('[limparDadosDeTeste] Falha ao remover colaborador/histórico de teste', e);
    }

    limparCadastroAuxiliar('BRH_MOTIVO_EVENTO', ['ZDM1', 'ZDM2']);
    // O Tipo Evento decoy ('ZDT_OUTRO') é exclusivo de teste — removido. O Tipo Evento
    // de Desligamento (DS_CODIGOFOLHA='DESLIGAMENTO') e a Situação "Demitido" NÃO são
    // removidos: são cadastros técnicos/compartilhados desta rotina (mesma política já
    // aplicada a BRH_SITUACAO_COLABORADOR em testimportfolha.js — não são exclusivos
    // de teste, podem ser reaproveitados por outros colaboradores/rodadas reais).
    limparCadastroAuxiliar('BRH_TIPO_EVENTO', [TIPO_EVENTO_CODIGO_DECOY]);
    limparCadastroAuxiliar('BRH_VINCULO_EMPREGATICIO', ['ZDV1', 'ZDV_OUTRO']);
    limparCadastroAuxiliar('BRH_CARGO', ['ZDC1']);
  }

  // ImportDesligamento compartilha o mesmo motor genérico de importação (mesmo bug de
  // Sucessos=0 corrigido em Folha) — cobertura mínima, lógica já testada a fundo em
  // testimportfolha.js (testarFinalizarContadoresImportacao).
  function testarFinalizarContadoresImportacao(result) {
    var resultado = utils.finalizarContadoresImportacao({ nr_registros: 50, nr_falhas: 3 });
    adicionar(result, 'Contador de sucesso - 50 registros / 3 falhas → 47 sucessos',
      resultado.nr_registrossucesso === 47, resultado);
  }

  function limparCadastroAuxiliar(entidade, codigos) {
    try {
      for (var i = 0; i < codigos.length; i++) {
        var registros = src.require('knex')(entidade).select('ID_' + entidade).where('DS_CODIGOFOLHA', codigos[i]).find() || [];
        for (var j = 0; j < registros.length; j++) {
          var filtro = {};
          filtro['id_' + entidade.toLowerCase()] = registros[j]['id_' + entidade.toLowerCase()];
          src.require('dao').getDao(entidade).filter(filtro).delete();
        }
      }
    } catch (e) {
      logger.error('[limparDadosDeTeste] Falha ao remover ' + entidade + ' de teste', e);
    }
  }

  function run() {
    var result = [];
    logger.warn('Iniciando testes de Folha - Desligamento');

    testarEmpresaInexistente(result);
    testarColaboradorInexistente(result);
    testarFinalizarContadoresImportacao(result);

    var idColaboradorCriado = null;
    try {
      idColaboradorCriado = testarFluxoCompleto(result);
    } finally {
      limparDadosDeTeste(idColaboradorCriado);
    }

    adicionarResumo(result);
    logger.warn('Finalizado testes de Folha - Desligamento');
    return result;
  }

  return {
    'run': run
  };
})();
