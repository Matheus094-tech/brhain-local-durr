/*
 * BusinessTestCompraFlex
 * durr.main.dev.business.testcompraflex
 *
 */
module.exports = (function () {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.business.testcompraflex');

  var src = require('plusoftcrm.libs.main.source')({
    'utilsCompraFlex': 'durr.main.dev.business.utilscompraflex',
    'compraBeneficioBotoes': 'durr.main.dev.business.comprabeneficiobotoes',
    'elegibilidadeFlex': 'durr.main.dev.business.elegibilidadeflex',
    'excel': 'plusoftcrm.libs.main.excel'
  });

  var utils = src.require('utilsCompraFlex');

  var TIPO_PRODUTO_FLEX_NOME = 'FlexCard';
  var MATRICULA_TESTE_REFEICAO = 'TESTEFLEXREF';
  var MATRICULA_TESTE_MULTI = 'TESTEFLEXMULTI';
  var CPF_TESTE_REFEICAO = '99999999901';
  var CPF_TESTE_MULTI = '99999999902';

  var EIXOS_FILTRO_ELEGIBILIDADE = [
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_EMPRESA', coluna: 'ID_BRH_EMPRESA', campo: 'id_brh_empresa' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_FILIAL', coluna: 'ID_BRH_FILIAL', campo: 'id_brh_filial' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_VINCULO_EMPREGATICIO', coluna: 'ID_BRH_VINCULO_EMPREGATICIO', campo: 'id_brh_vinculo_empregaticio' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_GRADE', coluna: 'ID_BRH_GRADE', campo: 'id_brh_grade' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_CARGO', coluna: 'ID_BRH_CARGO', campo: 'id_brh_cargo' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_SINDICATO', coluna: 'ID_BRH_SINDICATO', campo: 'id_brh_sindicato' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_JORNADA_TRABALHO', coluna: 'ID_BRH_JORNADA_TRABALHO', campo: 'id_brh_jornada_trabalho' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_CENTRO_CUSTO', coluna: 'ID_BRH_CENTRO_CUSTO', campo: 'id_brh_centro_custo' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_MODELO_TRABALHO', coluna: 'ID_BRH_MODELO_TRABALHO', campo: 'id_brh_modelo_trabalho' },
    { tabela: 'BRH_PLANO_ELEGIBILIDADE_MUNICIPIO', coluna: 'ID_BRH_MUNICIPIO', campo: 'id_brh_municipio' }
  ];

  function referenciaCompetenciaAtual() {
    var hoje = new Date();
    var mes = hoje.getMonth() + 1;
    return (mes < 10 ? '0' + mes : String(mes)) + String(hoje.getFullYear());
  }

  function resolverConfiguracaoFlex() {
    var tipoProduto = src.require('knex')('BRH_TIPO_PRODUTO')
      .select('ID_BRH_TIPO_PRODUTO', 'DS_NOME')
      .where('DS_NOME', TIPO_PRODUTO_FLEX_NOME)
      .findFirst();

    if (!tipoProduto) {
      throw src.new('UserException')('BRH_TIPO_PRODUTO "' + TIPO_PRODUTO_FLEX_NOME + '" não encontrado.');
    }

    var produto = src.require('knex')('BRH_PRODUTO')
      .select('ID_BRH_PRODUTO', 'DS_NOME', 'ID_BRH_TIPO_PRODUTO')
      .where('ID_BRH_TIPO_PRODUTO', tipoProduto.id_brh_tipo_produto)
      .where('OP_ATIVO', 'Y')
      .findFirst();

    if (!produto) {
      throw src.new('UserException')('Nenhum BRH_PRODUTO ativo encontrado para o tipo ' + TIPO_PRODUTO_FLEX_NOME + '.');
    }

    var contratoPlanos = utils.paraArray(src.require('knex')('BRH_CONTRATO_PLANO CP')
      .join('BRH_CONTRATO C', 'C.ID_BRH_CONTRATO = CP.ID_BRH_CONTRATO')
      .select(
        'CP.ID_BRH_CONTRATO_PLANO', 'CP.ID_BRH_PLANO', 'CP.DS_NOMEPLANO', 'CP.DS_CODIGOOPERADORA',
        'C.ID_BRH_CONTRATO', 'C.DS_CODIGOCONTRATO'
      )
      .where('C.ID_BRH_TIPO_PRODUTO', tipoProduto.id_brh_tipo_produto)
      .find());

    var contratoPlanoRefeicao = null;
    var contratoPlanoMulti = null;

    contratoPlanos.forEach(function (cp) {
      var destino = utils.identificarDestinoPlanoFlex(cp);
      if (destino === utils.DESTINO_REFEICAO && !contratoPlanoRefeicao) contratoPlanoRefeicao = cp;
      if (destino === utils.DESTINO_MULTIBENEFICIOS && !contratoPlanoMulti) contratoPlanoMulti = cp;
    });

    if (!contratoPlanoRefeicao || !contratoPlanoMulti) {
      throw src.new('UserException')('Não foi possível resolver os dois contrato/planos Flex (Refeição e Multibenefícios) via BRH_CONTRATO_PLANO.');
    }

    var planoElegibilidadeRefeicao = buscarPlanoElegibilidade(contratoPlanoRefeicao.id_brh_contrato_plano);
    var planoElegibilidadeMulti = buscarPlanoElegibilidade(contratoPlanoMulti.id_brh_contrato_plano);

    if (!planoElegibilidadeRefeicao || !planoElegibilidadeMulti) {
      throw src.new('UserException')('BRH_PLANO_ELEGIBILIDADE não configurado para um dos contrato/planos Flex.');
    }

    return {
      tipoProduto: tipoProduto,
      produto: produto,
      refeicao: { contratoPlano: contratoPlanoRefeicao, planoElegibilidade: planoElegibilidadeRefeicao },
      multibeneficios: { contratoPlano: contratoPlanoMulti, planoElegibilidade: planoElegibilidadeMulti }
    };
  }

  // O testador de métodos do InPaaS Studio chama cada função isolada, não só via run().
  function buscarColaboradorPorMatricula(matricula) {
    return src.require('knex')('BRH_COLABORADOR')
      .select('*')
      .where('DS_MATRICULA', matricula)
      .findFirst();
  }

  function obterColaboradoresTeste() {
    return {
      refeicao: buscarColaboradorPorMatricula(MATRICULA_TESTE_REFEICAO),
      multibeneficios: buscarColaboradorPorMatricula(MATRICULA_TESTE_MULTI)
    };
  }

  function exigirColaboradoresTeste(colaboradores) {
    if (!colaboradores || !colaboradores.refeicao || !colaboradores.multibeneficios) {
      throw src.new('UserException')('Massas de teste não encontradas. Rode prepararMassas() antes desta função.');
    }
    return colaboradores;
  }

  function buscarPlanoElegibilidade(idContratoPlano) {
    return src.require('knex')('BRH_PLANO_ELEGIBILIDADE')
      .select('ID_BRH_PLANO_ELEGIBILIDADE', 'DS_NOME', 'OP_SEXO', 'VL_SALARIOMINIMO', 'VL_SALARIOMAXIMO', 'DT_ADMISSAO', 'ID_BRH_CONTRATO_PLANO')
      .where('ID_BRH_CONTRATO_PLANO', idContratoPlano)
      .where('OP_STATUS', 'Y')
      .findFirst();
  }

  // elegibilidadeFlex processa todos os pendentes globalmente; por isso valida antes.
  function validarPreCondicoes(colaboradoresTeste) {
    colaboradoresTeste = colaboradoresTeste || obterColaboradoresTeste();

    var idsTeste = [];
    if (colaboradoresTeste) {
      if (colaboradoresTeste.refeicao) idsTeste.push(colaboradoresTeste.refeicao.id_brh_colaborador);
      if (colaboradoresTeste.multibeneficios) idsTeste.push(colaboradoresTeste.multibeneficios.id_brh_colaborador);
    }

    var pendentes = utils.paraArray(src.require('knex')('BRH_ELEGIBILIDADE_HISTORICO')
      .select('ID_BRH_ELEGIBILIDADE_HISTORICO', 'ID_BRH_COLABORADOR')
      .whereNull('ID_BRH_PLANO_ELEGIBILIDADE_FLEX')
      .find());

    var pendentesExternos = pendentes.filter(function (p) {
      return idsTeste.indexOf(p.id_brh_colaborador) === -1;
    });

    if (pendentesExternos.length > 0) {
      logger.error('Históricos de elegibilidade Flex pendentes fora da massa de teste — execução abortada.', pendentesExternos);
      return { ok: false, pendentesExternos: pendentesExternos };
    }

    return { ok: true, pendentesExternos: [] };
  }

  function prepararMassas(config) {
    config = config || resolverConfiguracaoFlex();

    var colaboradorRefeicao = buscarOuCriarColaboradorTeste(
      MATRICULA_TESTE_REFEICAO,
      CPF_TESTE_REFEICAO,
      config.refeicao.planoElegibilidade
    );
    var colaboradorMulti = buscarOuCriarColaboradorTeste(
      MATRICULA_TESTE_MULTI,
      CPF_TESTE_MULTI,
      config.multibeneficios.planoElegibilidade
    );

    return { refeicao: colaboradorRefeicao, multibeneficios: colaboradorMulti };
  }

  function buscarOuCriarColaboradorTeste(matricula, cpfPadrao, planoElegibilidade) {
    var existente = src.require('knex')('BRH_COLABORADOR')
      .select('*')
      .where('DS_MATRICULA', matricula)
      .findFirst();

    if (existente) return existente;

    var atributos = resolverAtributosElegibilidade(planoElegibilidade.id_brh_plano_elegibilidade);

    var situacaoAtiva = src.require('knex')('BRH_SITUACAO_COLABORADOR')
      .select('ID_BRH_SITUACAO_COLABORADOR')
      .where('OP_TIPO', '!=', 'T')
      .findFirst();

    if (!situacaoAtiva) {
      throw src.new('UserException')('Nenhuma BRH_SITUACAO_COLABORADOR ativa encontrada para montar a massa de teste.');
    }

    var novoColaborador = {
      id_brh_empresa: atributos.id_brh_empresa || primeiraEmpresaAtiva(),
      id_brh_filial: atributos.id_brh_filial,
      id_brh_grade: atributos.id_brh_grade,
      id_brh_cargo: atributos.id_brh_cargo,
      id_brh_sindicato: atributos.id_brh_sindicato,
      id_brh_vinculo_empregaticio: atributos.id_brh_vinculo_empregaticio,
      id_brh_jornada_trabalho: atributos.id_brh_jornada_trabalho,
      id_brh_centro_custo: atributos.id_brh_centro_custo,
      id_brh_modelo_trabalho: atributos.id_brh_modelo_trabalho,
      id_brh_municipio: atributos.id_brh_municipio,
      id_brh_situacao_colaborador: situacaoAtiva.id_brh_situacao_colaborador,
      op_sexo: planoElegibilidade.op_sexo && planoElegibilidade.op_sexo !== 'T' ? planoElegibilidade.op_sexo : 'M',
      vl_salario: resolverSalarioCompativel(planoElegibilidade),
      dt_admissao: planoElegibilidade.dt_admissao ? new Date(planoElegibilidade.dt_admissao) : new Date(2000, 0, 1),
      dt_nascimento: new Date(1990, 0, 1),
      ds_matricula: matricula,
      ds_nome: 'Colaborador Teste Flex ' + matricula,
      ds_cpf: cpfPadrao
    };

    src.require('dao').getDao('BRH_COLABORADOR').insert(novoColaborador);

    return src.require('knex')('BRH_COLABORADOR')
      .select('*')
      .where('DS_MATRICULA', matricula)
      .findFirst();
  }

  function resolverAtributosElegibilidade(idPlanoElegibilidade) {
    var atributos = {};
    EIXOS_FILTRO_ELEGIBILIDADE.forEach(function (eixo) {
      var linha = src.require('knex')(eixo.tabela)
        .select(eixo.coluna)
        .where('ID_BRH_PLANO_ELEGIBILIDADE', idPlanoElegibilidade)
        .findFirst();
      atributos[eixo.campo] = linha ? linha[eixo.campo] : null;
    });
    return atributos;
  }

  function resolverSalarioCompativel(planoElegibilidade) {
    var minimo = utils.converterNumero(planoElegibilidade.vl_salariominimo);
    var maximo = utils.converterNumero(planoElegibilidade.vl_salariomaximo);
    if (maximo > 0) return utils.arredondarMoeda(minimo > 0 ? (minimo + maximo) / 2 : maximo);
    if (minimo > 0) return utils.arredondarMoeda(minimo + 100);
    return 3000;
  }

  function primeiraEmpresaAtiva() {
    var empresa = src.require('knex')('BRH_EMPRESA')
      .select('ID_BRH_EMPRESA')
      .where('OP_ATIVO', 'Y')
      .findFirst();
    if (!empresa) {
      throw src.new('UserException')('Nenhuma BRH_EMPRESA ativa encontrada para montar a massa de teste.');
    }
    return empresa.id_brh_empresa;
  }

  function prepararHistoricosElegibilidade(colaboradores) {
    colaboradores = exigirColaboradoresTeste(colaboradores || obterColaboradoresTeste());

    [colaboradores.refeicao, colaboradores.multibeneficios].forEach(function (colaborador) {
      var pendenteExistente = src.require('knex')('BRH_ELEGIBILIDADE_HISTORICO')
        .select('ID_BRH_ELEGIBILIDADE_HISTORICO')
        .where('ID_BRH_COLABORADOR', colaborador.id_brh_colaborador)
        .whereNull('ID_BRH_PLANO_ELEGIBILIDADE_FLEX')
        .findFirst();

      if (pendenteExistente) return;

      src.require('dao').getDao('BRH_ELEGIBILIDADE_HISTORICO').insert({
        id_brh_colaborador: colaborador.id_brh_colaborador,
        ds_evento: 'Teste Flex',
        dt_evento: new Date(),
        id_brh_plano_elegibilidade_vr: 0,
        id_brh_plano_elegibilidade_va: 0,
        id_brh_plano_elegibilidade_vt: 0,
        id_brh_plano_elegibilidade_saude: 0,
        id_brh_plano_elegibilidade_odonto: 0,
        id_brh_plano_elegibilidade_vida: 0,
        id_brh_plano_elegibilidade_refeitorio: 0,
        id_brh_plano_elegibilidade_creche: 0,
        id_brh_plano_elegibilidade_previdencia: 0
      });
    });
  }

  function executarElegibilidade() {
    src.require('elegibilidadeFlex').aplicarElegibilidadeFlex();
  }

  function validarBeneficios(colaboradores, config) {
    config = config || resolverConfiguracaoFlex();
    colaboradores = exigirColaboradoresTeste(colaboradores || obterColaboradoresTeste());

    return {
      refeicao: validarBeneficioColaborador(colaboradores.refeicao, config.refeicao.contratoPlano),
      multibeneficios: validarBeneficioColaborador(colaboradores.multibeneficios, config.multibeneficios.contratoPlano)
    };
  }

  function validarBeneficioColaborador(colaborador, contratoPlano) {
    var beneficio = src.require('knex')('BRH_BENEFICIO')
      .select('*')
      .where('ID_BRH_COLABORADOR', colaborador.id_brh_colaborador)
      .where('ID_BRH_CONTRATO_PLANO', contratoPlano.id_brh_contrato_plano)
      .orderBy('DT_INICIOVIGENCIA', 'desc')
      .findFirst();

    if (!beneficio) {
      throw src.new('UserException')('Benefício Flex não foi gerado para o colaborador de teste ' + colaborador.id_brh_colaborador);
    }

    var somaCategorias = somarCategoriasFlex(contratoPlano.id_brh_contrato_plano);

    if (utils.arredondarMoeda(beneficio.vl_valor) !== somaCategorias) {
      throw src.new('UserException')(
        'BRH_BENEFICIO.VL_VALOR (' + beneficio.vl_valor + ') diverge da soma das categorias Flex (' +
        somaCategorias + ') para o colaborador ' + colaborador.id_brh_colaborador
      );
    }

    return { beneficio: beneficio, somaCategorias: somaCategorias };
  }

  function somarCategoriasFlex(idContratoPlano) {
    var categorias = utils.paraArray(src.require('knex')('BRH_CONTRATO_PLANO_CATEGORIA_FLEX')
      .select('NR_VALOR')
      .where('ID_BRH_CONTRATO_PLANO', idContratoPlano)
      .find());

    return utils.arredondarMoeda(categorias.reduce(function (soma, categoria) {
      return soma + utils.converterNumero(categoria.nr_valor);
    }, 0));
  }

  function criarCompraTeste(config, colaboradores) {
    config = config || resolverConfiguracaoFlex();
    colaboradores = exigirColaboradoresTeste(colaboradores || obterColaboradoresTeste());

    var referencia = referenciaCompetenciaAtual();

    var novaCompra = {
      id_brh_empresa: colaboradores.refeicao.id_brh_empresa,
      id_brh_produto: config.produto.id_brh_produto,
      ds_referencia: referencia,
      op_status: '1' // agendado
    };

    src.require('dao').getDao('BRH_COMPRA_BENEFICIO').insert(novaCompra);

    var compraInserida = src.require('knex')('BRH_COMPRA_BENEFICIO')
      .select('ID_BRH_COMPRA_BENEFICIO')
      .where('ID_BRH_PRODUTO', config.produto.id_brh_produto)
      .where('DS_REFERENCIA', referencia)
      .where('ID_BRH_EMPRESA', colaboradores.refeicao.id_brh_empresa)
      .orderBy('ID_BRH_COMPRA_BENEFICIO', 'desc')
      .findFirst();

    if (!compraInserida) {
      throw src.new('UserException')('Falha ao criar a compra de benefício de teste.');
    }

    return compraInserida.id_brh_compra_beneficio;
  }

  function executarCompra(idCompra) {
    if (!idCompra) {
      throw src.new('UserException')('idCompra é obrigatório. Rode criarCompraTeste() antes desta função.');
    }
    return src.require('compraBeneficioBotoes').invoke({ action: 'botao-calcular', id: idCompra });
  }

  function validarDetalhesCompra(idCompra, colaboradores, config) {
    if (!idCompra) {
      throw src.new('UserException')('idCompra é obrigatório. Rode criarCompraTeste() antes desta função.');
    }
    colaboradores = exigirColaboradoresTeste(colaboradores || obterColaboradoresTeste());
    config = config || resolverConfiguracaoFlex();

    var detalhes = utils.paraArray(src.require('knex')('BRH_COMPRA_BENEFICIO_DETALHE')
      .select('*')
      .where('ID_BRH_COMPRA_BENEFICIO', idCompra)
      .find());

    var contratoPlanoPorGrupo = { refeicao: config.refeicao.contratoPlano, multibeneficios: config.multibeneficios.contratoPlano };

    ['refeicao', 'multibeneficios'].forEach(function (grupo) {
      var colaborador = colaboradores[grupo];
      var detalheColaborador = detalhes.filter(function (d) {
        return d.id_brh_colaborador === colaborador.id_brh_colaborador;
      });

      if (detalheColaborador.length !== 1) {
        throw src.new('UserException')(
          'Esperado exatamente 1 BRH_COMPRA_BENEFICIO_DETALHE para o colaborador ' +
          colaborador.id_brh_colaborador + ', encontrado ' + detalheColaborador.length
        );
      }

      var detalhe = detalheColaborador[0];
      var somaCategorias = somarCategoriasFlex(contratoPlanoPorGrupo[grupo].id_brh_contrato_plano);

      if (utils.arredondarMoeda(detalhe.vl_compra) !== somaCategorias) {
        throw src.new('UserException')(
          'VL_COMPRA (' + detalhe.vl_compra + ') diverge da soma das categorias Flex (' +
          somaCategorias + ') para o colaborador ' + colaborador.id_brh_colaborador
        );
      }

      if (Number(detalhe.nr_dias_compra) !== 0) {
        throw src.new('UserException')(
          'NR_DIAS_COMPRA deveria ser 0, encontrado ' + detalhe.nr_dias_compra + ' para o colaborador ' + colaborador.id_brh_colaborador
        );
      }
    });

    var compra = src.require('knex')('BRH_COMPRA_BENEFICIO')
      .select('VL_COMPRATOTAL')
      .where('ID_BRH_COMPRA_BENEFICIO', idCompra)
      .findFirst();

    var somaDetalhes = utils.arredondarMoeda(detalhes.reduce(function (soma, d) {
      return soma + utils.converterNumero(d.vl_compra);
    }, 0));

    if (utils.arredondarMoeda(compra.vl_compratotal) !== somaDetalhes) {
      throw src.new('UserException')(
        'VL_COMPRATOTAL (' + compra.vl_compratotal + ') diverge da soma dos detalhes (' + somaDetalhes + ').'
      );
    }

    return { detalhes: detalhes, vlCompraTotal: compra.vl_compratotal };
  }

  function validarArquivo(resultadoCompra, colaboradores) {
    if (!resultadoCompra || !resultadoCompra.fileId) {
      throw src.new('UserException')('resultadoCompra.fileId é obrigatório. Rode executarCompra() antes desta função.');
    }
    colaboradores = exigirColaboradoresTeste(colaboradores || obterColaboradoresTeste());

    var linhas = src.require('excel').toArray(resultadoCompra.fileId);

    if (!linhas || linhas.length < 3) {
      throw src.new('UserException')('Arquivo Flex gerado não possui cabeçalho + as duas linhas de teste esperadas.');
    }

    var cabecalho = linhas[0];
    var idxCnpj = cabecalho.indexOf('CNPJ');
    var idxNome = cabecalho.indexOf('NOME COMPLETO');
    var idxCpf = cabecalho.indexOf('CPF');
    var idxMulti = cabecalho.indexOf('MULTIBENEFICIOS (R$)');
    var idxAlimRefeicao = cabecalho.indexOf('ALIMENTACAO E REFEICAO (R$)');

    if ([idxCnpj, idxNome, idxCpf, idxMulti, idxAlimRefeicao].indexOf(-1) !== -1) {
      throw src.new('UserException')('Cabeçalho do arquivo Flex não confere com o layout Flash esperado.');
    }

    var linhaRefeicao = encontrarLinhaPorCpf(linhas, idxCpf, colaboradores.refeicao.ds_cpf);
    var linhaMulti = encontrarLinhaPorCpf(linhas, idxCpf, colaboradores.multibeneficios.ds_cpf);

    if (!linhaRefeicao || !linhaMulti) {
      throw src.new('UserException')('Linhas dos colaboradores de teste não encontradas no arquivo gerado.');
    }

    if (String(linhaRefeicao[idxMulti]) !== '0' || utils.converterNumero(linhaRefeicao[idxAlimRefeicao]) <= 0) {
      throw src.new('UserException')('Linha Refeição não confere com o layout esperado (MULTIBENEFICIOS deve ser "0").');
    }

    if (String(linhaMulti[idxAlimRefeicao]) !== '0' || utils.converterNumero(linhaMulti[idxMulti]) <= 0) {
      throw src.new('UserException')('Linha Multibenefícios não confere com o layout esperado (ALIMENTACAO E REFEICAO deve ser "0").');
    }

    return { cabecalho: cabecalho, linhaRefeicao: linhaRefeicao, linhaMulti: linhaMulti };
  }

  function encontrarLinhaPorCpf(linhas, idxCpf, cpf) {
    for (var i = 1; i < linhas.length; i++) {
      if (linhas[i] && String(linhas[i][idxCpf]) === String(cpf)) return linhas[i];
    }
    return null;
  }

  // Opt-in — não é chamada automaticamente por run().
  function limparMassas(colaboradores, idCompra) {
    colaboradores = colaboradores || obterColaboradoresTeste();

    var dao = src.require('dao');

    if (idCompra) {
      dao.getDao('BRH_COMPRA_BENEFICIO_DETALHE').filter({ id_brh_compra_beneficio: idCompra }).delete();
      dao.getDao('BRH_COMPRA_BENEFICIO').filter({ id_brh_compra_beneficio: idCompra }).delete();
    }

    [colaboradores.refeicao, colaboradores.multibeneficios].forEach(function (colaborador) {
      if (!colaborador || !colaborador.id_brh_colaborador) return;
      dao.getDao('BRH_BENEFICIO').filter({ id_brh_colaborador: colaborador.id_brh_colaborador }).delete();
      dao.getDao('BRH_ELEGIBILIDADE_HISTORICO').filter({ id_brh_colaborador: colaborador.id_brh_colaborador }).delete();
      dao.getDao('BRH_COLABORADOR').filter({ id_brh_colaborador: colaborador.id_brh_colaborador }).delete();
    });

    logger.warn('Massas de teste Flex removidas (colaboradores e compra de teste).');
  }

  function run() {
    var relatorio = { etapas: [] };

    try {
      var config = resolverConfiguracaoFlex();
      relatorio.configuracao = {
        idProduto: config.produto.id_brh_produto,
        idContratoPlanoRefeicao: config.refeicao.contratoPlano.id_brh_contrato_plano,
        idContratoPlanoMultibeneficios: config.multibeneficios.contratoPlano.id_brh_contrato_plano
      };

      var colaboradores = prepararMassas(config);
      relatorio.colaboradores = {
        refeicao: colaboradores.refeicao.id_brh_colaborador,
        multibeneficios: colaboradores.multibeneficios.id_brh_colaborador
      };

      prepararHistoricosElegibilidade(colaboradores);

      var preCondicoes = validarPreCondicoes(colaboradores);
      if (!preCondicoes.ok) {
        relatorio.sucesso = false;
        relatorio.abortado = true;
        relatorio.motivo = 'Existem históricos de elegibilidade Flex pendentes fora da massa de teste.';
        relatorio.pendentesExternos = preCondicoes.pendentesExternos;
        logger.error('TestCompraFlex abortado antes de executar a elegibilidade.', relatorio);
        return relatorio;
      }

      executarElegibilidade();

      var beneficios = validarBeneficios(colaboradores, config);
      relatorio.beneficios = {
        refeicao: { id: beneficios.refeicao.beneficio.id_brh_beneficio, valor: beneficios.refeicao.beneficio.vl_valor },
        multibeneficios: { id: beneficios.multibeneficios.beneficio.id_brh_beneficio, valor: beneficios.multibeneficios.beneficio.vl_valor }
      };

      var idCompra = criarCompraTeste(config, colaboradores);
      relatorio.idCompraBeneficio = idCompra;

      var resultadoCompra = executarCompra(idCompra);
      relatorio.resultadoCompra = resultadoCompra;

      var detalhes = validarDetalhesCompra(idCompra, colaboradores, config);
      relatorio.vlCompraTotal = detalhes.vlCompraTotal;

      var arquivo = validarArquivo(resultadoCompra, colaboradores);
      relatorio.arquivo = arquivo;

      relatorio.sucesso = true;
      logger.info('TestCompraFlex concluído com sucesso.', relatorio);
      return relatorio;
    } catch (e) {
      relatorio.sucesso = false;
      relatorio.erro = e.message || e.toString();
      logger.error('TestCompraFlex falhou.', e);
      return relatorio;
    }
  }

  return {
    validarPreCondicoes: validarPreCondicoes,
    prepararMassas: prepararMassas,
    prepararHistoricosElegibilidade: prepararHistoricosElegibilidade,
    executarElegibilidade: executarElegibilidade,
    validarBeneficios: validarBeneficios,
    criarCompraTeste: criarCompraTeste,
    executarCompra: executarCompra,
    validarDetalhesCompra: validarDetalhesCompra,
    validarArquivo: validarArquivo,
    limparMassas: limparMassas,
    resolverConfiguracaoFlex: resolverConfiguracaoFlex,
    run: run
  };
})();
