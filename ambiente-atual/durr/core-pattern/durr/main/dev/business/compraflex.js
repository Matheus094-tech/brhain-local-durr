/*
 * BusinessCompraFlex
 * durr.main.dev.business.compraflex
 *
 */
module.exports = (function () {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.business.compraflex');

  var src = require('plusoftcrm.libs.main.source')({
    'utilsCompraFlex': 'durr.main.dev.business.utilscompraflex',
    'arquivoCompraFlex': 'durr.main.dev.business.arquivocompraflex'
  });

  var utils = src.require('utilsCompraFlex');

  // BRH_COMPRA_BENEFICIO.OP_STATUS: 1 agendado, 2 execução, 3 finalizado.
  var STATUS_EXECUCAO = '2';
  var STATUS_FINALIZADO = '3';

  function processarCompra(compra) {
    validarProcessamentoNovo(compra);

    marcarEmExecucao(compra.id_brh_compra_beneficio);

    var intervalo = utils.intervaloCompetencia(compra.ds_referencia);
    if (!intervalo) {
      throw src.new('UserException')(utils.MENSAGENS.referenciaInvalida + compra.ds_referencia);
    }

    var candidatos = buscarBeneficiosCandidatos(compra);

    var resultado = montarLinhasEDetalhes(candidatos, intervalo, compra);

    if (!resultado.detalhes.length) {
      throw src.new('UserException')(utils.MENSAGENS.nenhumBeneficioVigente);
    }

    var arquivo = src.require('arquivoCompraFlex').gerarArquivo(compra, resultado.linhas);

    validarProcessamentoNovo(compra);

    persistirDetalhes(resultado.detalhes);

    finalizarCompra(compra.id_brh_compra_beneficio, resultado.valorTotal, arquivo.fileId);

    return {
      sucesso: true,
      idCompraBeneficio: compra.id_brh_compra_beneficio,
      totalColaboradores: resultado.detalhes.length,
      valorCompraTotal: utils.arredondarMoeda(resultado.valorTotal),
      fileId: arquivo.fileId,
      nomeArquivo: arquivo.nomeArquivo
    };
  }

  function validarProcessamentoNovo(compra) {
    if (String(compra.op_status) === STATUS_FINALIZADO) {
      throw src.new('UserException')(utils.MENSAGENS.compraJaProcessada);
    }

    var detalheExistente = src.require('knex')('BRH_COMPRA_BENEFICIO_DETALHE')
      .select('ID_BRH_COMPRA_BENEFICIO_DETALHE')
      .where('ID_BRH_COMPRA_BENEFICIO', compra.id_brh_compra_beneficio)
      .findFirst();

    if (detalheExistente) {
      throw src.new('UserException')(utils.MENSAGENS.compraJaProcessada);
    }
  }

  // Sem BRH_COMPRA_BENEFICIO_PRODUTO: compra Flex é sempre pelo produto do cabeçalho.
  function buscarBeneficiosCandidatos(compra) {
    var query = src.require('knex')('BRH_BENEFICIO BE')
      .join('BRH_CONTRATO_PLANO CP', 'CP.ID_BRH_CONTRATO_PLANO = BE.ID_BRH_CONTRATO_PLANO')
      .join('BRH_CONTRATO C', 'C.ID_BRH_CONTRATO = BE.ID_BRH_CONTRATO')
      .join('BRH_COLABORADOR COL', 'COL.ID_BRH_COLABORADOR = BE.ID_BRH_COLABORADOR')
      .join('BRH_EMPRESA EMP', 'EMP.ID_BRH_EMPRESA = COL.ID_BRH_EMPRESA')
      .select(
        'BE.ID_BRH_BENEFICIO',
        'BE.ID_BRH_COLABORADOR',
        'BE.ID_BRH_CONTRATO',
        'BE.ID_BRH_CONTRATO_PLANO',
        'BE.VL_VALOR',
        'BE.OP_STATUS',
        'BE.DT_INICIOVIGENCIA',
        'BE.DT_TERMINOVIGENCIA',
        'CP.ID_BRH_PLANO',
        'CP.DS_NOMEPLANO',
        'CP.DS_CODIGOOPERADORA',
        'C.DS_CODIGOCONTRATO',
        'COL.DS_NOME AS colaborador_nome',
        'COL.DS_CPF AS colaborador_cpf',
        'EMP.DS_CNPJ AS empresa_cnpj'
      )
      .where('C.ID_BRH_PRODUTO', compra.id_brh_produto);

    if (compra.id_brh_empresa && !representaTodas('BRH_EMPRESA', 'ID_BRH_EMPRESA', compra.id_brh_empresa, 'DS_RAZAOSOCIAL')) {
      query.where('COL.ID_BRH_EMPRESA', compra.id_brh_empresa);
    }

    if (compra.id_brh_filial && !representaTodas('BRH_FILIAL', 'ID_BRH_FILIAL', compra.id_brh_filial, 'DS_RAZAOSOCIAL')) {
      query.where('COL.ID_BRH_FILIAL', compra.id_brh_filial);
    }

    if (compra.id_brh_operadora && !representaTodas('BRH_OPERADORA', 'ID_BRH_OPERADORA', compra.id_brh_operadora, 'DS_NOME')) {
      query.where('C.ID_BRH_OPERADORA', compra.id_brh_operadora);
    }

    return utils.paraArray(query.find());
  }

  // "Todas" é sentinela (DS_RAZAOSOCIAL) e não restringe empresa/filial/operadora.
  function representaTodas(tabela, colunaId, id, colunaNome) {
    var registro = src.require('knex')(tabela)
      .select(colunaNome)
      .where(colunaId, id)
      .findFirst();

    if (!registro) return false;

    var valor = registro[colunaNome.toLowerCase()];
    return typeof valor === 'string' && valor.trim().toUpperCase() === 'TODAS';
  }

  function montarLinhasEDetalhes(candidatos, intervalo, compra) {
    var linhas = [];
    var detalhes = [];
    var colaboradoresProcessados = {};
    var valoresPorContratoPlano = {};
    var valorTotal = 0;

    candidatos.forEach(function (candidato) {
      if (!utils.beneficioVigenteNaCompetencia(candidato, intervalo)) return;

      // Um colaborador só pode ter um plano Flex nesta compra; mantém o primeiro.
      if (colaboradoresProcessados[candidato.id_brh_colaborador]) {
        logger.warn('Colaborador com mais de um benefício Flex vigente na mesma compra, mantendo o primeiro: ' + candidato.id_brh_colaborador);
        return;
      }

      if (!utils.campoPreenchido(candidato.colaborador_cpf)) {
        logger.warn(utils.MENSAGENS.colaboradorSemCpf + candidato.id_brh_colaborador);
        return;
      }

      if (!utils.campoPreenchido(candidato.empresa_cnpj)) {
        logger.warn(utils.MENSAGENS.empresaSemCnpj + candidato.id_brh_colaborador);
        return;
      }

      var destino = utils.identificarDestinoPlanoFlex(candidato);
      if (!destino) {
        logger.warn(utils.MENSAGENS.contratoPlanoDesconhecido + candidato.id_brh_contrato_plano);
        return;
      }

      var valorCompra = obterValorCompraFlexCache(candidato.id_brh_contrato_plano, valoresPorContratoPlano);
      if (valorCompra === null) return;

      if (utils.arredondarMoeda(candidato.vl_valor) !== valorCompra) {
        logger.warn(
          'BRH_BENEFICIO.VL_VALOR diverge da soma atual de BRH_CONTRATO_PLANO_CATEGORIA_FLEX — usando a soma das categorias. ' +
          'benefício=' + candidato.id_brh_beneficio + ', contrato/plano=' + candidato.id_brh_contrato_plano +
          ', vl_valor=' + candidato.vl_valor + ', soma categorias=' + valorCompra
        );
      }

      colaboradoresProcessados[candidato.id_brh_colaborador] = true;

      linhas.push(utils.montarLinhaLayoutFlash({
        cnpjEmpresa: candidato.empresa_cnpj,
        nomeColaborador: candidato.colaborador_nome,
        cpfColaborador: candidato.colaborador_cpf,
        valorBeneficio: valorCompra,
        destino: destino
      }));

      detalhes.push({
        id_brh_compra_beneficio: compra.id_brh_compra_beneficio,
        id_brh_colaborador: candidato.id_brh_colaborador,
        id_brh_produto: compra.id_brh_produto,
        id_brh_beneficio: candidato.id_brh_beneficio,
        vl_beneficio: valorCompra,
        vl_compra: valorCompra,
        // NR_DIAS_COMPRA é obrigatório na tabela; Compra Flex não tem cálculo proporcional.
        nr_dias_compra: 0,
        id_brh_plano: candidato.id_brh_plano,
        id_brh_contrato: candidato.id_brh_contrato,
        ds_codigocontrato: candidato.ds_codigocontrato,
        ds_referencia: compra.ds_referencia
      });

      valorTotal += valorCompra;
    });

    return { linhas: linhas, detalhes: detalhes, valorTotal: valorTotal };
  }

  // Valor vem de BRH_CONTRATO_PLANO_CATEGORIA_FLEX, não de BRH_BENEFICIO.VL_VALOR.
  function obterValorCompraFlex(idContratoPlano) {
    var categorias = utils.paraArray(src.require('knex')('BRH_CONTRATO_PLANO_CATEGORIA_FLEX')
      .select('NR_VALOR')
      .where('ID_BRH_CONTRATO_PLANO', idContratoPlano)
      .find());

    if (!categorias.length) {
      throw src.new('UserException')(utils.MENSAGENS.contratoPlanoSemCategoria + idContratoPlano);
    }

    var total = categorias.reduce(function (soma, categoria) {
      return soma + utils.converterNumero(categoria.nr_valor);
    }, 0);

    return utils.arredondarMoeda(total);
  }

  function obterValorCompraFlexCache(idContratoPlano, cache) {
    if (Object.prototype.hasOwnProperty.call(cache, idContratoPlano)) {
      return cache[idContratoPlano];
    }
    var valor = null;
    try {
      valor = obterValorCompraFlex(idContratoPlano);
    } catch (e) {
      logger.warn(e.message || String(e));
    }
    cache[idContratoPlano] = valor;
    return valor;
  }

  function persistirDetalhes(detalhes) {
    var dao = src.require('dao');
    detalhes.forEach(function (detalhe) {
      dao.getDao('BRH_COMPRA_BENEFICIO_DETALHE').insert(detalhe);
    });
  }

  function marcarEmExecucao(idCompraBeneficio) {
    src.require('dao').getDao('BRH_COMPRA_BENEFICIO')
      .filter({ id_brh_compra_beneficio: idCompraBeneficio })
      .update({ op_status: STATUS_EXECUCAO });
  }

  function finalizarCompra(idCompraBeneficio, valorTotal, fileId) {
    src.require('dao').getDao('BRH_COMPRA_BENEFICIO')
      .filter({ id_brh_compra_beneficio: idCompraBeneficio })
      .update({
        op_status: STATUS_FINALIZADO,
        vl_compratotal: utils.arredondarMoeda(valorTotal),
        id_core_file: fileId,
        id_core_file_xls: fileId,
        dt_geracao: new Date()
      });
  }

  return {
    processarCompra: processarCompra
  };
})();
