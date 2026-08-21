/*
 * BusinessImportAfastados
 * durr.main.dev.integracao.businessImportAfastados
 *
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.integracao.businessImportAfastados');

  var src = require('plusoftcrm.libs.main.source')({
    'utilsImportAfastados': 'durr.main.dev.integracao.utilsimportafastados'
  });

  var utils = src.require('utilsImportAfastados');

  function processarAfastamento(afastamento) {
    var resultado = { sucesso: true, acao: null, idAfastamento: null, mensagens: [], avisos: [] };
    afastamento = afastamento || {};

    try {
      var codigoEmpresa = utils.textoLimpo(afastamento.Empresa);
      var matricula = utils.textoLimpo(afastamento.Matricula);
      var nomeTipoBruto = afastamento.TipoAfastamento;

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
      if (!utils.campoPreenchido(afastamento.DataAfastamento)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Data de Afastamento não encontrada.');
        return resultado;
      }
      if (!utils.campoPreenchido(nomeTipoBruto)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Tipo de afastamento inválido.');
        return resultado;
      }

      var empresa = localizarEmpresa(codigoEmpresa);
      if (!empresa) {
        resultado.sucesso = false;
        resultado.mensagens.push('Empresa não encontrada.');
        return resultado;
      }

      var buscaColaborador = localizarColaborador(empresa.id_brh_empresa, matricula);
      if (buscaColaborador.status === 'naoEncontrado') {
        resultado.sucesso = false;
        resultado.mensagens.push('Colaborador não encontrado.');
        return resultado;
      }
      if (buscaColaborador.status === 'ambiguo') {
        resultado.sucesso = false;
        resultado.mensagens.push('Mais de um colaborador encontrado para a mesma empresa e matrícula.');
        return resultado;
      }
      var colaborador = buscaColaborador.colaborador;

      validarEstabelecimento(afastamento.CodigoEstabelecimento, empresa, colaborador, resultado);

      var datas = validarDatas(afastamento.DataAfastamento, afastamento.DataRetorno, afastamento.NumeroDias, resultado);
      if (!datas) {
        resultado.sucesso = false;
        return resultado;
      }

      var tipoAfastamento = obterOuCriarTipoAfastamento(nomeTipoBruto, colaborador.id_brh_grupo_economico, resultado);
      if (!tipoAfastamento) {
        resultado.sucesso = false;
        if (!resultado.mensagens.length) {
          resultado.mensagens.push('Tipo de afastamento inválido.');
        }
        return resultado;
      }

      if (!empresa.id_brh_empresa || !colaborador.id_brh_colaborador || !tipoAfastamento.id_brh_tipo_afastamento) {
        resultado.sucesso = false;
        resultado.mensagens.push('Não foi possível resolver os identificadores de empresa, colaborador ou tipo de afastamento.');
        return resultado;
      }

      var dadosAfastamento = montarDadosAfastamento(empresa, colaborador, tipoAfastamento, datas);
      var afastamentoExistente = localizarAfastamentoExistente(colaborador.id_brh_colaborador, tipoAfastamento.id_brh_tipo_afastamento, datas.dtInicio);

      var sincronizado;
      if (!afastamentoExistente) {
        sincronizado = criarAfastamento(dadosAfastamento);
        resultado.acao = 'criado';
        resultado.mensagens.push('Afastamento criado.');
      } else if (possuiAlteracao(dadosAfastamento, afastamentoExistente)) {
        sincronizado = atualizarAfastamento(dadosAfastamento, afastamentoExistente);
        resultado.acao = 'atualizado';
        resultado.mensagens.push(utils.ehAfastamentoAberto(datas.dtTermino) ? 'Afastamento atualizado.' : 'Afastamento atualizado com data de retorno.');
      } else {
        sincronizado = afastamentoExistente;
        resultado.acao = 'semAlteracao';
        resultado.mensagens.push('Afastamento já sincronizado.');
      }

      resultado.idAfastamento = sincronizado.id_brh_afastamento;
    } catch (e) {
      logger.error('Erro ao processar afastamento', e);
      resultado.sucesso = false;
      resultado.mensagens.push('Erro ao processar afastamento: ' + (e.message || e.toString()));
    }
    return resultado;
  }

  function localizarEmpresa(codigoFolha) {
    var empresa = src.require('knex')('BRH_EMPRESA')
      .select('ID_BRH_EMPRESA', 'DS_RAZAOSOCIAL')
      .where('DS_CODIGOFOLHA', codigoFolha.toString().trim())
      .findFirst();
    if (!empresa || empresaESentinela(empresa)) return null;
    return empresa;
  }

  function empresaESentinela(empresa) {
    var razaoSocial = (empresa.ds_razaosocial || '').toString().trim().toLowerCase();
    return razaoSocial === 'todas';
  }

  function localizarColaborador(idEmpresa, matricula) {
    var lista = src.require('knex')('BRH_COLABORADOR')
      .select('ID_BRH_COLABORADOR', 'ID_BRH_FILIAL', 'DS_CPF', 'ID_BRH_GRUPO_ECONOMICO')
      .where('ID_BRH_EMPRESA', idEmpresa)
      .where('DS_MATRICULA', matricula)
      .find();

    if (!lista || lista.length === 0) return { status: 'naoEncontrado' };
    if (lista.length > 1) return { status: 'ambiguo' };
    return { status: 'ok', colaborador: lista[0] };
  }

  // Filial persistida vem sempre do colaborador. O Código do Estabelecimento do
  // arquivo só é usado como checagem adicional best-effort, sem bloquear a linha.
  function validarEstabelecimento(codigoEstabelecimento, empresa, colaborador, resultado) {
    if (!utils.campoPreenchido(codigoEstabelecimento)) return;

    var filial = src.require('knex')('BRH_FILIAL')
      .select('ID_BRH_FILIAL')
      .where('ID_BRH_EMPRESA', empresa.id_brh_empresa)
      .where('DS_CODIGOFOLHA', codigoEstabelecimento.toString().trim())
      .findFirst();

    if (filial && filial.id_brh_filial !== colaborador.id_brh_filial) {
      resultado.avisos.push('Estabelecimento do arquivo (código ' + codigoEstabelecimento + ') diverge da filial atual do colaborador.');
    }
  }

  function validarDatas(dataAfastamentoBruta, dataRetornoBruta, numeroDiasBruto, resultado) {
    var dtInicio = utils.converterDataAfastamento(dataAfastamentoBruta);
    if (!dtInicio) {
      resultado.mensagens.push('Data de afastamento inválida.');
      return null;
    }

    var dtRetorno = null;
    if (utils.campoPreenchido(dataRetornoBruta)) {
      dtRetorno = utils.converterDataAfastamento(dataRetornoBruta);
      if (!dtRetorno) {
        resultado.mensagens.push('Data de retorno inválida.');
        return null;
      }
      if (dtRetorno <= dtInicio) {
        resultado.mensagens.push('Data de retorno anterior ou igual à data de afastamento.');
        return null;
      }
    }

    var nrQuantidade = null;
    if (utils.campoPreenchido(numeroDiasBruto)) {
      nrQuantidade = parseInt(numeroDiasBruto, 10);
      if (isNaN(nrQuantidade)) {
        resultado.mensagens.push('Número de dias inválido.');
        return null;
      }
    }

    // Data de Retorno é o primeiro dia trabalhado, não um dia de afastamento.
    if (dtRetorno && nrQuantidade !== null) {
      var diasCalculados = utils.diferencaDias(dtInicio, dtRetorno);
      if (diasCalculados !== nrQuantidade) {
        resultado.mensagens.push('Número de dias divergente (informado ' + nrQuantidade + ', calculado ' + diasCalculados + ').');
        return null;
      }
    }

    return {
      dtInicio: dtInicio,
      dtTermino: dtRetorno ? utils.subtrairUmDia(dtRetorno) : utils.dataTerminoAberto(),
      nrQuantidade: nrQuantidade
    };
  }

  function obterOuCriarTipoAfastamento(nomeTipoBruto, idGrupoEconomico, resultado) {
    var nomeLimpo = utils.textoLimpo(nomeTipoBruto);
    if (!nomeLimpo) return null;

    var chaveComparacao = utils.normalizarNomeTipo(nomeLimpo);

    var tiposDoGrupo = src.require('knex')('BRH_TIPO_AFASTAMENTO')
      .select('ID_BRH_TIPO_AFASTAMENTO', 'DS_NOME', 'DS_CODIGOFOLHA')
      .where('ID_BRH_GRUPO_ECONOMICO', idGrupoEconomico)
      .find() || [];

    var codigoExtraido = utils.extrairCodigoTipo(nomeLimpo);

    // Resultado do Knex não é um Array nativo (sem .filter/.map) neste runtime;
    // percorrer por índice é o padrão seguro já usado no código legado.
    var existente = null;
    var conflitoCodigo = null;
    for (var i = 0; i < tiposDoGrupo.length; i++) {
      var tipo = tiposDoGrupo[i];
      if (!existente && utils.normalizarNomeTipo(tipo.ds_nome) === chaveComparacao) {
        existente = tipo;
      }
      if (codigoExtraido && !conflitoCodigo && utils.textoLimpo(tipo.ds_codigofolha).toUpperCase() === codigoExtraido.toUpperCase()) {
        conflitoCodigo = tipo;
      }
    }

    if (existente) return existente;

    // BRH_TIPO_AFASTAMENTO.DS_CODIGOFOLHA é NOT NULL neste ambiente. Todo o layout
    // real de afastados segue o padrão "CODIGO - Nome"; quando não segue, a linha
    // é rejeitada em vez de gravar um tipo sem código.
    if (!codigoExtraido) {
      resultado.mensagens.push('Tipo de afastamento sem código reconhecível (formato esperado: "CODIGO - Nome").');
      return null;
    }

    if (conflitoCodigo) {
      resultado.avisos.push('Tipo de afastamento "' + nomeLimpo + '" tem o mesmo código de folha de "' + conflitoCodigo.ds_nome + '"; mantendo registros distintos por nome.');
    }

    var novoRegistro = {
      id_brh_grupo_economico: idGrupoEconomico,
      ds_nome: nomeLimpo,
      ds_codigofolha: codigoExtraido
    };
    src.require('dao').getDao('BRH_TIPO_AFASTAMENTO').insert(novoRegistro);

    return novoRegistro;
  }

  function montarDadosAfastamento(empresa, colaborador, tipoAfastamento, datas) {
    return {
      id_brh_empresa: empresa.id_brh_empresa,
      id_brh_filial: colaborador.id_brh_filial || null,
      id_brh_tipo_afastamento: tipoAfastamento.id_brh_tipo_afastamento,
      ds_cpf: colaborador.ds_cpf,
      id_brh_colaborador: colaborador.id_brh_colaborador,
      dt_inicio: datas.dtInicio,
      dt_termino: datas.dtTermino,
      nr_quantidade: datas.nrQuantidade
    };
  }

  // DT_INICIO não entra no WHERE do Knex: comparar timestamp com o Date do JS
  // gera "operator does not exist: timestamp without time zone = character
  // varying" neste ambiente. Busca por colaborador+tipo e filtra em JS.
  function localizarAfastamentoExistente(idColaborador, idTipoAfastamento, dtInicio) {
    var registros = src.require('knex')('BRH_AFASTAMENTO')
      .select('ID_BRH_AFASTAMENTO', 'DT_INICIO', 'DT_TERMINO', 'NR_QUANTIDADE')
      .where('ID_BRH_COLABORADOR', idColaborador)
      .where('ID_BRH_TIPO_AFASTAMENTO', idTipoAfastamento)
      .find() || [];

    var inicioEsperado = utils.normalizarValorComparacaoData(dtInicio);

    for (var i = 0; i < registros.length; i++) {
      if (utils.normalizarValorComparacaoData(registros[i].dt_inicio) === inicioEsperado) {
        return registros[i];
      }
    }

    return null;
  }

  function possuiAlteracao(dadosNovos, existente) {
    var ambosAbertos = utils.ehAfastamentoAberto(dadosNovos.dt_termino) && utils.ehAfastamentoAberto(existente.dt_termino);
    if (!ambosAbertos) {
      var terminoNovo = utils.normalizarValorComparacaoData(dadosNovos.dt_termino);
      var terminoAtual = utils.normalizarValorComparacaoData(existente.dt_termino);
      if (terminoNovo !== terminoAtual) return true;
    }

    var quantidadeNova = utils.campoPreenchido(dadosNovos.nr_quantidade) ? Number(dadosNovos.nr_quantidade) : null;
    var quantidadeAtual = utils.campoPreenchido(existente.nr_quantidade) ? Number(existente.nr_quantidade) : null;
    return quantidadeNova !== quantidadeAtual;
  }

  function criarAfastamento(dados) {
    src.require('dao').getDao('BRH_AFASTAMENTO').insert(dados);
    return dados;
  }

  function atualizarAfastamento(dadosNovos, existente) {
    var dados = {
      id_brh_afastamento: existente.id_brh_afastamento,
      dt_termino: dadosNovos.dt_termino,
      nr_quantidade: dadosNovos.nr_quantidade
    };
    src.require('dao').getDao('BRH_AFASTAMENTO')
      .filter({ id_brh_afastamento: existente.id_brh_afastamento })
      .update(dados);
    return dados;
  }

  var COLUNAS = {
    EMPRESA: 'Empresa',
    CODIGO_ESTABELECIMENTO: 'Código do Estabelecimento',
    MATRICULA: 'Matrícula',
    NOME: 'Nome',
    NUMERO_DIAS: 'Número de Dias',
    DATA_AFASTAMENTO: 'Data de Afastamento',
    DATA_RETORNO: 'Data de Retorno',
    TIPO_AFASTAMENTO: 'Tipo de Afastamento'
  };

  function mapearLinhaParaAfastamento(linha) {
    return {
      Empresa: linha[COLUNAS.EMPRESA],
      CodigoEstabelecimento: linha[COLUNAS.CODIGO_ESTABELECIMENTO],
      Matricula: linha[COLUNAS.MATRICULA],
      Nome: linha[COLUNAS.NOME],
      NumeroDias: linha[COLUNAS.NUMERO_DIAS],
      DataAfastamento: linha[COLUNAS.DATA_AFASTAMENTO],
      DataRetorno: linha[COLUNAS.DATA_RETORNO],
      TipoAfastamento: linha[COLUNAS.TIPO_AFASTAMENTO]
    };
  }

  function importAfastados(payload) {
    var relatorio = utils.criarRelatorioImportacao();
    try {
      var linhas = payload && payload['afastamentos'];
      if (!linhas || typeof linhas.forEach !== 'function') {
        utils.registrarErro(relatorio, 'payload', 'Nenhum registro recebido para importação (chave "afastamentos" ausente ou não é uma lista).');
        return relatorio;
      }

      linhas.forEach(function(linha) {
        relatorio.totalRecebidos++;
        var matricula = utils.textoLimpo(linha[COLUNAS.MATRICULA]);
        var afastamentoDto = mapearLinhaParaAfastamento(linha);
        var resultado = processarAfastamento(afastamentoDto);

        if (resultado.sucesso) {
          var mensagem = resultado.mensagens.join(' | ');
          var dados = { id_brh_afastamento: resultado.idAfastamento };
          if (resultado.acao === 'criado') {
            utils.registrarCriado(relatorio, matricula, mensagem, dados);
          } else if (resultado.acao === 'atualizado') {
            utils.registrarAtualizado(relatorio, matricula, mensagem, dados);
          } else {
            utils.registrarSemAlteracao(relatorio, matricula, mensagem, dados);
          }
        } else {
          utils.registrarErro(relatorio, matricula, resultado.mensagens.join(' | '));
        }

        resultado.avisos.forEach(function(aviso) {
          utils.registrarAviso(relatorio, matricula, aviso);
        });
      });

      if (relatorio.totalRecebidos === 0) {
        utils.registrarErro(relatorio, 'payload', 'A lista de afastamentos recebida está vazia.');
      }
    } catch (e) {
      logger.error('Erro inesperado ao importar afastamentos', e);
      utils.registrarErro(relatorio, 'payload', 'Erro inesperado na importação: ' + (e.message || e.toString()));
    }
    return relatorio;
  }

  return {
    // núcleo — usado pela tela de importação de Excel (uma linha por vez) e pelo lote REST
    'processarAfastamento': processarAfastamento,
    // lote — usado pelo endpoint POST
    'importAfastados': importAfastados
  };
})();
