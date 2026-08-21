/*
 * BusinessImportDesligamento
 * durr.main.dev.integracao.businessImportDesligamento
 *
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.integracao.businessImportDesligamento');

  var src = require('plusoftcrm.libs.main.source')({
    'utilsImportDesligamento': 'durr.main.dev.integracao.utilsimportdesligamento',
    'businessImportFolha': 'durr.main.dev.integracao.businessImportFolha'
  });

  var utils = src.require('utilsImportDesligamento');

  // Chave técnica determinística do Tipo de Evento usado por esta rotina — a planilha
  // de desligamento não fornece nenhum código de Tipo Evento, só Código/Nome do Motivo.
  // Confirmado em DEV (DevStudio + evidência de cliente produtivo) que BRH_TIPO_EVENTO
  // exige ID_BRH_GRUPO_ECONOMICO/DS_NOME/DS_CODIGOFOLHA — e que BRH_MOTIVO_EVENTO exige
  // ID_BRH_TIPO_EVENTO (não é opcional). Um cliente produtivo tinha vários motivos
  // (pedido de demissão, término de contrato, dispensa sem justa causa, ...) todos
  // ligados a um único Tipo Evento "Demissão" — TIPO EVENTO é a classificação macro,
  // MOTIVO EVENTO é o motivo específico. Os IDs/códigos daquele cliente (ex.:
  // ID_BRH_TIPO_EVENTO=11, DS_CODIGOFOLHA=26) são daquele ambiente e não foram
  // copiados para o DURR.
  var TIPO_EVENTO_CODIGO_TECNICO = 'DESLIGAMENTO';
  var TIPO_EVENTO_NOME_PADRAO = 'Demissão';
  // Antes de criar, procura também cadastro semanticamente equivalente já configurado
  // no ambiente (evita duplicidade em ambiente onde outro fluxo já cadastrou o tipo
  // sem o código técnico DURR).
  var NOMES_TIPO_EVENTO_EQUIVALENTES = ['Demissão', 'Desligamento'];

  // Situação "Demitido" reaproveita o resolvedor já existente de BRH_SITUACAO_COLABORADOR
  // (mesma classificação técnica OP_TIPO='T' já mapeada em BusinessImportFolha) — não
  // cria lógica paralela de Situação.
  var CODIGO_SITUACAO_DEMITIDO = 'Demitido';

  // desligamento: { CodigoEmpresa, Matricula, Nome, CPF, DataDesligamento,
  //   MotivoCodigo, MotivoNome, VinculoCodigo, VinculoNome }
  function processarDesligamento(desligamento) {
    var resultado = { sucesso: true, acao: null, idColaborador: null, mensagens: [], avisos: [] };
    desligamento = desligamento || {};

    try {
      // 1) validar linha
      var codigoEmpresa = utils.textoLimpo(desligamento.CodigoEmpresa);
      var matricula = utils.textoLimpo(desligamento.Matricula);

      if (!utils.campoPreenchido(codigoEmpresa)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Empresa não encontrada.');
        return resultado;
      }
      if (!utils.campoPreenchido(matricula)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Matrícula não encontrada.');
        return resultado;
      }

      var idEmpresa = utils.mapeamentoCodigoFolha('BRH_EMPRESA', codigoEmpresa, 'ID_BRH_EMPRESA');
      if (!utils.campoPreenchido(idEmpresa)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Empresa não encontrada pelo código de folha.');
        return resultado;
      }

      // 2) localizar colaborador
      var colaborador = utils.buscarUm('BRH_COLABORADOR', { id_brh_empresa: idEmpresa, ds_matricula: matricula });
      if (!colaborador) {
        resultado.sucesso = false;
        resultado.mensagens.push('Colaborador não encontrado.');
        return resultado;
      }

      var cpfArquivo = utils.formatarCpf(desligamento.CPF);
      if (utils.campoPreenchido(cpfArquivo) && utils.campoPreenchido(colaborador.ds_cpf) && cpfArquivo !== colaborador.ds_cpf) {
        resultado.sucesso = false;
        resultado.mensagens.push('CPF divergente do cadastro localizado (arquivo: ' + cpfArquivo + ', cadastro: ' + colaborador.ds_cpf + ').');
        return resultado;
      }

      var dataDesligamento = utils.converterDataOficial(desligamento.DataDesligamento);
      if (!(dataDesligamento instanceof Date) || isNaN(dataDesligamento.getTime())) {
        resultado.sucesso = false;
        resultado.mensagens.push('Data de Desligamento inválida ou não informada.');
        return resultado;
      }

      var codigoMotivo = utils.textoLimpo(desligamento.MotivoCodigo);
      if (!utils.campoPreenchido(codigoMotivo)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Código do motivo de desligamento não informado.');
        return resultado;
      }

      var idGrupoEconomico = src.require('businessImportFolha').obterIdGrupoEconomico();
      if (!idGrupoEconomico) {
        resultado.sucesso = false;
        resultado.mensagens.push('Grupo econômico padrão não configurado.');
        return resultado;
      }

      // 3) obter/criar Tipo Evento de Desligamento
      var idTipoEvento = obterOuCriarTipoEventoDesligamento(idGrupoEconomico, resultado);

      // 4) obter/criar Motivo Evento (identidade = Tipo Evento + Código folha)
      var motivo = resolverOuCriarMotivoEvento(idTipoEvento, codigoMotivo, utils.textoLimpo(desligamento.MotivoNome), resultado);

      // 5) obter/criar/resolver Situação Demitido (reaproveita helper existente)
      var idSituacaoDemitido = src.require('businessImportFolha').resolverOuCriarSituacao(CODIGO_SITUACAO_DEMITIDO, idGrupoEconomico, resultado);
      if (!utils.campoPreenchido(idSituacaoDemitido)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Não foi possível resolver a Situação "Demitido".');
        return resultado;
      }

      validarVinculo(desligamento, colaborador, idGrupoEconomico, resultado);

      var dadosNovos = {
        dt_desligamento: dataDesligamento,
        id_brh_tipo_evento: idTipoEvento,
        id_brh_motivo_evento: motivo.id_brh_motivo_evento,
        id_brh_situacao_colaborador: idSituacaoDemitido
      };

      // 6) UPDATE apenas com todos os IDs já resolvidos
      if (!possuiAlteracaoDesligamento(dadosNovos, colaborador)) {
        resultado.acao = 'semAlteracao';
        resultado.idColaborador = colaborador.id_brh_colaborador;
        resultado.mensagens.push('Desligamento já sincronizado.');
        return resultado;
      }

      try {
        src.require('dao').getDao('BRH_COLABORADOR')
          .filter({ id_brh_colaborador: colaborador.id_brh_colaborador })
          .update({
            id_brh_colaborador: colaborador.id_brh_colaborador,
            dt_desligamento: dataDesligamento,
            id_brh_tipo_evento: idTipoEvento,
            id_brh_motivo_evento: motivo.id_brh_motivo_evento,
            id_brh_situacao_colaborador: idSituacaoDemitido
          });
      } catch (e) {
        logger.error('Erro ao atualizar colaborador desligado', e);
        throw new Error(
          'Não foi possível atualizar o colaborador desligado. Matrícula: ' + matricula +
          ' | Data desligamento: ' + dataDesligamento.toISOString().substring(0, 10) +
          ' | ID Tipo Evento: ' + idTipoEvento +
          ' | ID Motivo Evento: ' + motivo.id_brh_motivo_evento +
          ' | ID Situação: ' + idSituacaoDemitido +
          ' | Erro: ' + (e.message || e.toString())
        );
      }

      // 7) registrar histórico de elegibilidade (helper já existente, sem payload paralelo)
      src.require('businessImportFolha').registrarHistoricoElegibilidade(colaborador.id_brh_colaborador, 'Desligamento', dataDesligamento);

      resultado.acao = 'atualizado';
      resultado.idColaborador = colaborador.id_brh_colaborador;
      resultado.mensagens.push('Colaborador desligado.');
    } catch (e) {
      logger.error('Erro ao processar desligamento', e);
      resultado.sucesso = false;
      resultado.mensagens.push('Erro ao processar desligamento: ' + (e.message || e.toString()));
    }
    return resultado;
  }

  // Prioridade: A) DS_CODIGOFOLHA técnico DURR; B) cadastro existente semanticamente
  // equivalente (Demissão/Desligamento) — reaproveita sem renomear, avisa; C) cria.
  function obterOuCriarTipoEventoDesligamento(idGrupoEconomico, resultado) {
    var porCodigo = utils.buscarUm('BRH_TIPO_EVENTO', { ds_codigofolha: TIPO_EVENTO_CODIGO_TECNICO });
    if (porCodigo) return porCodigo.id_brh_tipo_evento;

    for (var i = 0; i < NOMES_TIPO_EVENTO_EQUIVALENTES.length; i++) {
      var porNome = utils.buscarUm('BRH_TIPO_EVENTO', { ds_nome: NOMES_TIPO_EVENTO_EQUIVALENTES[i] });
      if (porNome) {
        resultado.avisos.push(
          'Tipo de Evento de Desligamento reaproveitou cadastro existente ("' + porNome.ds_nome +
          '", código folha "' + porNome.ds_codigofolha + '") — nenhum Tipo de Evento novo foi criado.'
        );
        return porNome.id_brh_tipo_evento;
      }
    }

    var novoRegistro = {
      id_brh_grupo_economico: idGrupoEconomico,
      ds_codigofolha: TIPO_EVENTO_CODIGO_TECNICO,
      ds_nome: TIPO_EVENTO_NOME_PADRAO
    };
    try {
      src.require('dao').getDao('BRH_TIPO_EVENTO').insert(novoRegistro);
    } catch (e) {
      logger.error('Erro ao criar Tipo de Evento de Desligamento', e);
      throw new Error(
        'Não foi possível criar Tipo de Evento de Desligamento. Tipo: ' + TIPO_EVENTO_NOME_PADRAO +
        ' | Código técnico: ' + TIPO_EVENTO_CODIGO_TECNICO +
        ' | Erro: ' + (e.message || e.toString())
      );
    }
    return novoRegistro.id_brh_tipo_evento;
  }

  // Identidade do motivo = ID_BRH_TIPO_EVENTO + DS_CODIGOFOLHA (nunca só o código —
  // o mesmo código pode existir sob outro Tipo Evento sem relação com este fluxo).
  function resolverOuCriarMotivoEvento(idTipoEvento, codigo, nome, resultado) {
    var existente = utils.buscarUm('BRH_MOTIVO_EVENTO', { id_brh_tipo_evento: idTipoEvento, ds_codigofolha: codigo });
    if (existente) {
      if (utils.campoPreenchido(nome) && existente.ds_nome !== nome) {
        resultado.avisos.push('Motivo de desligamento código "' + codigo + '" já cadastrado como "' + existente.ds_nome + '"; nome recebido "' + nome + '" foi ignorado (código vence).');
      }
      return existente;
    }

    var novoRegistro = {
      id_brh_tipo_evento: idTipoEvento,
      ds_codigofolha: codigo,
      ds_nome: utils.campoPreenchido(nome) ? nome : codigo
    };
    try {
      src.require('dao').getDao('BRH_MOTIVO_EVENTO').insert(novoRegistro);
    } catch (e) {
      logger.error('Erro ao criar Motivo de Evento', e);
      throw new Error(
        'Não foi possível criar Motivo de Evento. Código motivo: ' + codigo +
        ' | Nome motivo: ' + novoRegistro.ds_nome +
        ' | ID Tipo Evento: ' + idTipoEvento +
        ' | Erro: ' + (e.message || e.toString())
      );
    }
    resultado.avisos.push('Motivo de desligamento criado — código ' + codigo + ', nome "' + novoRegistro.ds_nome + '".');
    return novoRegistro;
  }

  function validarVinculo(desligamento, colaborador, idGrupoEconomico, resultado) {
    var codigoVinculoArquivo = utils.textoLimpo(desligamento.VinculoCodigo);
    if (!utils.campoPreenchido(codigoVinculoArquivo)) return;

    var idVinculoArquivo = utils.mapeamentoCodigoFolhaOuCriar('BRH_VINCULO_EMPREGATICIO', codigoVinculoArquivo, utils.textoLimpo(desligamento.VinculoNome), 'ID_BRH_VINCULO_EMPREGATICIO', idGrupoEconomico);
    if (utils.campoPreenchido(idVinculoArquivo) && colaborador.id_brh_vinculo_empregaticio && String(idVinculoArquivo) !== String(colaborador.id_brh_vinculo_empregaticio)) {
      resultado.avisos.push('Vínculo Empregatício do arquivo diverge do vínculo atual do colaborador.');
    }
  }

  function possuiAlteracaoDesligamento(dadosNovos, colaboradorAtual) {
    var dataNova = utils.normalizarValorComparacaoData(dadosNovos.dt_desligamento);
    var dataAtual = utils.normalizarValorComparacaoData(colaboradorAtual.dt_desligamento);
    if (dataNova !== dataAtual) return true;
    if (Number(dadosNovos.id_brh_motivo_evento) !== Number(colaboradorAtual.id_brh_motivo_evento)) return true;
    if (Number(dadosNovos.id_brh_tipo_evento) !== Number(colaboradorAtual.id_brh_tipo_evento)) return true;
    return Number(dadosNovos.id_brh_situacao_colaborador) !== Number(colaboradorAtual.id_brh_situacao_colaborador);
  }

  function importDesligamento(payload) {
    var relatorio = utils.criarRelatorioImportacao();
    try {
      var linhas = payload && payload['desligamentos'];
      if (!linhas || typeof linhas.forEach !== 'function') {
        utils.registrarErro(relatorio, 'payload', 'Nenhum registro recebido para importação (chave "desligamentos" ausente ou não é uma lista).');
        return relatorio;
      }

      linhas.forEach(function(linha) {
        var matricula = utils.textoLimpo(linha.Matricula);
        var resultado = processarDesligamento(linha);

        if (resultado.sucesso) {
          utils.registrarSucesso(relatorio, matricula, resultado.mensagens.join(' | '), { id_brh_colaborador: resultado.idColaborador });
        } else {
          utils.registrarErro(relatorio, matricula, resultado.mensagens.join(' | '));
        }
        resultado.avisos.forEach(function(aviso) {
          utils.registrarAviso(relatorio, matricula, aviso);
        });
      });
    } catch (e) {
      logger.error('Erro inesperado ao importar desligamentos', e);
      utils.registrarErro(relatorio, 'payload', 'Erro inesperado na importação: ' + (e.message || e.toString()));
    }
    return relatorio;
  }

  return {
    // núcleo — usado pela leitura de Excel (uma linha por vez) e pelo lote REST
    'processarDesligamento': processarDesligamento,
    // lote — usado pelo endpoint POST
    'importDesligamento': importDesligamento
  };
})();
