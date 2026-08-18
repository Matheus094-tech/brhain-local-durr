/*
 * BusinessElegibilidadeFlex
 * durr.main.dev.business.elegibilidadeflex
 *
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger(
    'durr.main.dev.business.elegibilidadeflex'
  );

  var src = require('plusoftcrm.libs.main.source')();

  function aplicarElegibilidadeFlex() {
    var elegibilidadesPendentes = src
    .require('knex')('BRH_ELEGIBILIDADE_HISTORICO')
    .whereNull('ID_BRH_PLANO_ELEGIBILIDADE_FLEX')
    .select(
      'ID_BRH_ELEGIBILIDADE_HISTORICO',
      'ID_BRH_COLABORADOR',
      'DT_EVENTO'
    )
    .find();

    logger.warn(
      'Lista de elegibilidades Flex pendentes',
      elegibilidadesPendentes
    );

    elegibilidadesPendentes.forEach(function(elegibilidade) {
      processarElegibilidade(elegibilidade);
    });
  }

  function processarElegibilidade(elegibilidade) {
    var idColaborador =
        elegibilidade.id_brh_colaborador;

    try {
      logger.warn(
        'Processando elegibilidade Flex - colaborador: ' +
        idColaborador,
        elegibilidade
      );

      var consultaElegibilidade = src
      .require('durr.main.dev.business.elegibilidade')
      .obterElegibilidade(idColaborador, 7);

      logger.warn(
        'Retorno da elegibilidade Flex - colaborador: ' +
        idColaborador,
        consultaElegibilidade
      );

      if (!consultaElegibilidade) {
        logger.warn(
          'Nenhum plano Flex elegível para o colaborador: ' +
          idColaborador
        );

        return;
      }

      var idContratoPlano =
          consultaElegibilidade.id_brh_contrato_plano;

      var categorias = obterCategoriasFlex(
        idContratoPlano
      );

      if (!categorias || categorias.length === 0) {
        logger.warn(
          'Nenhuma categoria Flex encontrada para o contrato/plano: ' +
          idContratoPlano
        );

        return;
      }

      var valorBeneficio =
          calcularValorCategorias(categorias);

      var valorDesconto =
          calcularDescontoTitular(
            valorBeneficio,
            consultaElegibilidade.vl_descontotitular,
            consultaElegibilidade.op_tipodescontotitular
          );

      var beneficioExistente = obterBeneficioExistente(
        idColaborador,
        idContratoPlano
      );

      if (!beneficioExistente) {
        criarBeneficio(
          elegibilidade,
          consultaElegibilidade,
          valorBeneficio,
          valorDesconto,
          elegibilidade.dt_evento
        );

        logger.warn(
          'Benefício Flex criado para o colaborador: ' +
          idColaborador
        );
      } else if (
        valoresDiferentes(
          beneficioExistente.vl_valor,
          valorBeneficio
        )
      ) {
        atualizarBeneficioPorMudancaDeValor(
          beneficioExistente,
          elegibilidade,
          consultaElegibilidade,
          valorBeneficio,
          valorDesconto
        );
      } else {
        logger.warn(
          'Benefício Flex já existente e com o mesmo valor. ' +
          'Colaborador: ' +
          idColaborador +
          ', contrato/plano: ' +
          idContratoPlano +
          ', valor: ' +
          valorBeneficio
        );
      }

      marcarHistoricoComoProcessado(
        elegibilidade.id_brh_elegibilidade_historico,
        consultaElegibilidade.id_brh_plano_elegibilidade
      );

    } catch (e) {
      logger.error(
        'Erro ao processar elegibilidade Flex para o colaborador ' +
        idColaborador,
        e
      );
    }
  }

  function obterBeneficioExistente(idColaborador, idContratoPlano) {
    return src
      .require('knex')('BRH_BENEFICIO')
      .select(
      'ID_BRH_BENEFICIO',
      'ID_BRH_COLABORADOR',
      'ID_BRH_CONTRATO',
      'ID_BRH_CONTRATO_PLANO',
      'ID_BRH_PLANO_ELEGIBILIDADE',
      'DT_INICIOVIGENCIA',
      'DT_TERMINOVIGENCIA',
      'OP_STATUS',
      'VL_VALOR',
      'VL_DESCONTOTITULAR'
    )
      .where(
      'ID_BRH_COLABORADOR',
      idColaborador
    )
      .where(
      'ID_BRH_CONTRATO_PLANO',
      idContratoPlano
    )
      .where('OP_STATUS', '2')
      .whereNull('DT_TERMINOVIGENCIA')
      .orderBy(
      'DT_INICIOVIGENCIA',
      'desc'
    )
      .findFirst();
  }

  function atualizarBeneficioPorMudancaDeValor(beneficioExistente, elegibilidade, consultaElegibilidade, valorBeneficio, valorDesconto) {
    var ultimoDiaMesAtual =
        obterUltimoDiaMesAtual();

    var primeiroDiaProximoMes =
        obterPrimeiroDiaProximoMes();

    finalizarBeneficio(
      beneficioExistente.id_brh_beneficio,
      ultimoDiaMesAtual
    );

    criarBeneficio(
      elegibilidade,
      consultaElegibilidade,
      valorBeneficio,
      valorDesconto,
      primeiroDiaProximoMes
    );

    logger.warn(
      'Benefício Flex atualizado por mudança de valor - ' +
      JSON.stringify({
        idBeneficioAnterior:
        beneficioExistente.id_brh_beneficio,

        valorAnterior:
        beneficioExistente.vl_valor,

        valorNovo:
        valorBeneficio,

        fimVigenciaAnterior:
        ultimoDiaMesAtual,

        inicioVigenciaNovo:
        primeiroDiaProximoMes
      })
    );
  }

  function finalizarBeneficio(idBeneficio, dataFimVigencia) {    
    src.require('inpaas.core.entity.dao')
      .getDao('BRH_BENEFICIO')
      .filter({ID_BRH_BENEFICIO: idBeneficio})
      .update({DT_TERMINOVIGENCIA: dataFimVigencia});        
  }

  function criarBeneficio(elegibilidade, consultaElegibilidade, valorBeneficio, valorDesconto, dataInicioVigencia) {
    var novoFlex = {
      id_brh_colaborador:
      elegibilidade.id_brh_colaborador,

      id_brh_contrato:
      consultaElegibilidade.id_brh_contrato,

      id_brh_contrato_plano:
      consultaElegibilidade.id_brh_contrato_plano,

      id_brh_plano_elegibilidade:
      consultaElegibilidade.id_brh_plano_elegibilidade,

      dt_iniciovigencia:
      dataInicioVigencia,

      op_status:
      obterStatus(dataInicioVigencia),

      vl_valor:
      arredondarMoeda(valorBeneficio),

      vl_descontotitular:
      arredondarMoeda(valorDesconto),

      vl_solicitadoflex: 0
    };

    logger.warn(
      'Inserindo benefício Flex',
      JSON.stringify(novoFlex)
    );

    return src
      .require('inpaas.core.entity.dao')
      .getDao('BRH_BENEFICIO')
      .insert(novoFlex);
  }

  function marcarHistoricoComoProcessado(idHistorico, idPlanoElegibilidade) {
    src.require('inpaas.core.entity.dao')
      .getDao('BRH_ELEGIBILIDADE_HISTORICO')
      .filter({ID_BRH_ELEGIBILIDADE_HISTORICO: idHistorico})
      .update({ID_BRH_PLANO_ELEGIBILIDADE_FLEX: idPlanoElegibilidade});        

    logger.warn(
      'Histórico de elegibilidade Flex atualizado - ' +
      JSON.stringify({
        idHistorico: idHistorico,
        idPlanoElegibilidade:
        idPlanoElegibilidade
      })
    );
  }

  function obterCategoriasFlex(idContratoPlano) {
    if (!idContratoPlano) {
      return [];
    }

    return src
      .require('knex')(
      'BRH_CONTRATO_PLANO_CATEGORIA_FLEX'
    )
      .select(
      'ID_BRH_CONTRATO_PLANO_CATEGORIA_FLEX',
      'ID_BRH_CONTRATO_PLANO',
      'NR_VALOR'
    )
      .where(
      'ID_BRH_CONTRATO_PLANO',
      idContratoPlano
    )
      .find();
  }

  function calcularValorCategorias(categorias) {
    var valorTotal = 0;

    categorias.forEach(function(categoria) {
      valorTotal += converterNumero(
        categoria.nr_valor
      );
    });

    return arredondarMoeda(valorTotal);
  }

  function calcularDescontoTitular(valorBeneficio, valorDesconto, tipoDesconto) {
    var baseCalculo =
        converterNumero(valorBeneficio);

    var descontoConfigurado =
        converterNumero(valorDesconto);

    if (Number(tipoDesconto) === 2) {
      return arredondarMoeda(
        baseCalculo * descontoConfigurado / 100
      );
    }

    return arredondarMoeda(
      descontoConfigurado
    );
  }

  function valoresDiferentes(valorAtual, valorNovo) {
    var valorAtualCentavos = Math.round(
      converterNumero(valorAtual) * 100
    );

    var valorNovoCentavos = Math.round(
      converterNumero(valorNovo) * 100
    );

    return valorAtualCentavos !== valorNovoCentavos;
  }

  function obterUltimoDiaMesAtual() {
    var hoje = new Date();

    return new Date(
      hoje.getFullYear(),
      hoje.getMonth() + 1,
      0
    );
  }

  function obterPrimeiroDiaProximoMes() {
    var hoje = new Date();

    return new Date(
      hoje.getFullYear(),
      hoje.getMonth() + 1,
      1
    );
  }

  function obterStatus(dataEvento) {
    if (!dataEvento) {
      return 2;
    }

    var hoje = new Date();
    var evento = new Date(dataEvento);

    hoje.setHours(0, 0, 0, 0);
    evento.setHours(0, 0, 0, 0);

    return evento > hoje ? 1 : 2;
  }

  function converterNumero(valor) {
    if (
      valor === null ||
      valor === undefined ||
      String(valor).trim() === ''
    ) {
      return 0;
    }

    var numero = Number(
      String(valor).replace(',', '.')
    );

    return isNaN(numero) ? 0 : numero;
  }

  function arredondarMoeda(valor) {
    return Math.round(
      converterNumero(valor) * 100
    ) / 100;
  }

  return {
    aplicarElegibilidadeFlex:
    aplicarElegibilidadeFlex
  };
})();