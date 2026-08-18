/*
 * BusinessElegibilidade
 * durr.main.dev.business.elegibilidade
 * 
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.business.elegibilidade');
  var src = require('plusoftcrm.libs.main.source')();  

  function obterElegibilidade(idColaborador, tipoProduto) {

    try {
      var parametrosElegibilidade = obterParametrosColaborador(idColaborador);

      if (!parametrosElegibilidade) {
        logger.warn('Colaborador não encontrado: ' + idColaborador);
        return false;
      }

      return retornarPlanoElegibilidade(tipoProduto, parametrosElegibilidade);

    } catch (e) {
      logger.error('Erro ao obter elegibilidade do colaborador ' + idColaborador, e);
      return false;
    }
  }

  function obterParametrosColaborador(idColaborador) {
    var colaborador = src.require('knex')('BRH_COLABORADOR C')
    .select(
      'C.ID_BRH_EMPRESA',
      'C.ID_BRH_FILIAL',
      'C.ID_BRH_GRADE',
      'C.ID_BRH_CENTRO_CUSTO',
      'C.ID_BRH_CARGO',
      'C.ID_BRH_JORNADA_TRABALHO',
      'C.ID_BRH_SINDICATO',
      'C.ID_BRH_VINCULO_EMPREGATICIO',
      'C.ID_BRH_MODELO_TRABALHO',
      'C.ID_BRH_MUNICIPIO',
      'C.OP_SEXO',
      'C.VL_SALARIO',
      'C.DT_ADMISSAO'
    )
    .where('C.ID_BRH_COLABORADOR', idColaborador)
    .findFirst();

    if (!colaborador) {
      return null;
    }

    return {
      empresa: colaborador.id_brh_empresa,
      filial: colaborador.id_brh_filial,
      grade: colaborador.id_brh_grade,
      centro_custo: colaborador.id_brh_centro_custo,
      cargo: colaborador.id_brh_cargo,
      jornada: colaborador.id_brh_jornada_trabalho,
      sindicato: colaborador.id_brh_sindicato,
      vinculo: colaborador.id_brh_vinculo_empregaticio,
      modelo_trabalho: colaborador.id_brh_modelo_trabalho,
      municipio: colaborador.id_brh_municipio,
      sexo: colaborador.op_sexo,
      salario: colaborador.vl_salario,
      data_admissao: colaborador.dt_admissao
    };
  }

  function retornarPlanoElegibilidade(idProduto, parametrosElegibilidade) {   

    try {
      var planos = src.require('dao').getDao('BRH_PLANO_ELEGIBILIDADE')
      .find("SELECT PL.ID_BRH_PLANO_ELEGIBILIDADE, PL.DS_NOME " +          
            "   , CASE WHEN PL.OP_SEXO != 'T' THEN 1 ELSE 0 END SEXO " +
            "   , CASE WHEN PL.VL_SALARIOMINIMO > 0 OR PL.VL_SALARIOMAXIMO > 0 THEN 1 ELSE 0 END AS SALARIO " +
            "   , CASE WHEN PL.DT_ADMISSAO IS NOT NULL THEN 1 ELSE 0 END ADMISSAO " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_EMPRESA where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END EMPRESA " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_FILIAL where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END FILIAL " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_VINCULO_EMPREGATICIO where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE)  > 0 THEN 1 ELSE 0 END  VINCULO " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_GRADE where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END  GRADE " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_CARGO where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END  CARGO " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_SINDICATO where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END  SINDICATO " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_JORNADA_TRABALHO where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END  JORNADA " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_CENTRO_CUSTO where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END  CENTRO " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_MODELO_TRABALHO where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END  MODELO " +
            "   , CASE WHEN (SELECT COUNT(1) FROM BRH_PLANO_ELEGIBILIDADE_MUNICIPIO where ID_BRH_PLANO_ELEGIBILIDADE = PL.ID_BRH_PLANO_ELEGIBILIDADE) > 0 THEN 1 ELSE 0 END  MUNICIPIO " +
            "  FROM BRH_PLANO_ELEGIBILIDADE PL " +
            "WHERE PL.OP_STATUS = 'Y' AND PL.ID_BRH_TIPO_PRODUTO = " + idProduto );

      for (var i = 0; i < planos.length; i++) {
        var plano = planos[i];

        var total = plano.SEXO +
            plano.SALARIO +
            plano.ADMISSAO +
            plano.EMPRESA +
            plano.FILIAL +
            plano.VINCULO +
            plano.GRADE +
            plano.CARGO +
            plano.SINDICATO +
            plano.JORNADA +
            plano.CENTRO +
            plano.MODELO +
            plano.MUNICIPIO;

        plano.total = total;        
      }

      planos.sort(function(a, b) {
        return b.total - a.total;
      });

      for (var p = 0; p < planos.length; p++) {
        var item = planos[p];

        configurarFiltrosPlano(item);

        var planosEncontrados = executarQueryElegibilidade(
          parametrosElegibilidade,
          item
        );

        if (!planosEncontrados || typeof planosEncontrados.length !== 'number') {
          continue;
        }

        if (planosEncontrados.length === 0) {
          continue;
        }
        
        // Retorna o contrato/plano elegível com a maior quantidade de critérios.
        // Todos os produtos, inclusive o Flex, seguem a mesma regra.
        return planosEncontrados[0];
      }

      return false;

      /*planos.sort(function(a, b) {
        return b.TOTAL - a.TOTAL;
      });

      var achouPlano = false;
      var resultQuery;

      planos.forEach(function(item){

        if (achouPlano)
          return;

        if (item.total > 0)
        {          
          item.filtroEmpresa = item.EMPRESA > 0;
          item.filtroFilial = item.FILIAL > 0;
          item.filtroVinculo = item.VINCULO > 0;
          item.filtroGrade = item.GRADE > 0;
          item.filtroCargo = item.CARGO > 0;
          item.filtroSindicato = item.SINDICATO > 0;
          item.filtroJornada = item.JORNADA > 0;
          item.filtroCentroCusto = item.CENTRO > 0;
          item.filtroModeloTrabalho = item.MODELO > 0;
          item.filtroMunicipio = item.MUNICIPIO > 0;
          item.filtroSexo = item.SEXO > 0;
          item.filtroSalario = item.SALARIO > 0;
          item.filtroDataAdmissao = item.ADMISSAO > 0;

          resultQuery = executarQueryElegibilidade(parametrosElegibilidade, item, idProduto);
          achouPlano = resultQuery.length == 1;                   
        }        
      });

      if (resultQuery.length == 1)
        return resultQuery[0];
      else
        return false;*/

    } catch (e) {
      return false;
    }
  }

  function configurarFiltrosPlano(item) {
    item.filtroEmpresa = item.EMPRESA > 0;
    item.filtroFilial = item.FILIAL > 0;
    item.filtroVinculo = item.VINCULO > 0;
    item.filtroGrade = item.GRADE > 0;
    item.filtroCargo = item.CARGO > 0;
    item.filtroSindicato = item.SINDICATO > 0;
    item.filtroJornada = item.JORNADA > 0;
    item.filtroCentroCusto = item.CENTRO > 0;
    item.filtroModeloTrabalho = item.MODELO > 0;
    item.filtroMunicipio = item.MUNICIPIO > 0;
    item.filtroSexo = item.SEXO > 0;
    item.filtroSalario = item.SALARIO > 0;
    item.filtroDataAdmissao = item.ADMISSAO > 0;
  }

  function executarQueryElegibilidade(parametrosElegibilidade, filtros) {  
    try {
      var queryElegibilidade = src.require('knex')('BRH_PLANO_ELEGIBILIDADE PE')
      .select(
        'PE.ID_BRH_PLANO_ELEGIBILIDADE',
        'PE.ID_BRH_CONTRATO_PLANO',
        'PE.ID_BRH_CONTRATO',
        'CPL.VL_PLANO',
        'CPL.VL_VALOR_DIA DIAS_COMPRA',
        'CPL.OP_PERIODICIDADE',
        'PE.VL_DESCONTOTITULAR',
        'PE.OP_TIPODESCONTOTITULAR'
      )
      .join('BRH_CONTRATO_PLANO CPL', 'CPL.ID_BRH_CONTRATO_PLANO = PE.ID_BRH_CONTRATO_PLANO')
      .where('PE.ID_BRH_PLANO_ELEGIBILIDADE', filtros.id_brh_plano_elegibilidade)      
      .where('PE.OP_STATUS', "Y");

      var queryElegibilidadeFiltro = queryElegibilidade;

      if (filtros.filtroSexo){
        queryElegibilidade.where('PE.OP_SEXO', parametrosElegibilidade.sexo);
      }

      if (filtros.filtroSalario){
        queryElegibilidade
          .where('PE.VL_SALARIOMINIMO', '<=', parametrosElegibilidade.salario)
          .where('PE.VL_SALARIOMAXIMO', '>=', parametrosElegibilidade.salario);    
      }

      if (filtros.filtroDataAdmissao){
        queryElegibilidade.where('PE.DT_ADMISSAO', '>=', parametrosElegibilidade.data_admissao);
      }

      if (filtros.filtroEmpresa) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_EMPRESA as PEE')
            .whereRaw('PEE.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PEE.ID_BRH_EMPRESA', parametrosElegibilidade.empresa);
        });
      }

      if (filtros.filtroFilial) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_FILIAL PEF')
            .whereRaw('PEF.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PEF.ID_BRH_FILIAL', parametrosElegibilidade.filial);
        });
      }

      if (filtros.filtroVinculo) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_VINCULO_EMPREGATICIO PEVE')
            .whereRaw('PEVE.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PEVE.ID_BRH_VINCULO_EMPREGATICIO', parametrosElegibilidade.vinculo);
        });
      }

      if (filtros.filtroGrade) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_GRADE PEG')
            .whereRaw('PEG.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PEG.ID_BRH_GRADE', parametrosElegibilidade.grade);
        });        
      }

      if (filtros.filtroCargo) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_CARGO PEC')
            .whereRaw('PEC.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PEC.ID_BRH_CARGO', parametrosElegibilidade.cargo);
        });
      }

      if (filtros.filtroSindicato) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_SINDICATO PES')
            .whereRaw('PES.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PES.ID_BRH_SINDICATO', parametrosElegibilidade.sindicato);
        });
      }

      if (filtros.filtroJornada) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_JORNADA_TRABALHO PEJT')
            .whereRaw('PEJT.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PEJT.ID_BRH_JORNADA_TRABALHO', parametrosElegibilidade.jornada);
        });        
      }

      if (filtros.filtroCentroCusto) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_CENTRO_CUSTO PECC')
            .whereRaw('PECC.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PECC.ID_BRH_CENTRO_CUSTO', parametrosElegibilidade.centro_custo);
        });                
      }

      if (filtros.filtroModeloTrabalho) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_MODELO_TRABALHO PEMT')
            .whereRaw('PEMT.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PEMT.ID_BRH_MODELO_TRABALHO', parametrosElegibilidade.modelo_trabalho);
        });
      }

      if (filtros.filtroMunicipio) {
        queryElegibilidade.whereExists(function () {
          this.select(1)
            .from('BRH_PLANO_ELEGIBILIDADE_MUNICIPIO PEM')
            .whereRaw('PEM.ID_BRH_PLANO_ELEGIBILIDADE = PE.ID_BRH_PLANO_ELEGIBILIDADE')
            .andWhere('PEM.ID_BRH_MUNICIPIO', parametrosElegibilidade.municipio);
        });        
      }                

      return queryElegibilidade.find();
    } catch (e) {
      return "Erro: " + e.message;
    }
  }

  return {
    'obterElegibilidade': obterElegibilidade
  };

})();