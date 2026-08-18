/*
 * DashboardDependente
 * durr.main.dev.dashboard.dependente
 * 
 */

module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.dashboard.dependente');

  var src = require('plusoftcrm.libs.main.source')({
    'now': 'plusoftcrm.libs.main.now'
  });

  var FAIXAS_ETARIAS = [
    { label: '0 a 5 anos', min: 0, max: 5 },
    { label: '6 a 17 anos', min: 6, max: 17 },
    { label: '18 a 23 anos', min: 18, max: 23 },
    { label: '24 a 35 anos', min: 24, max: 35 },
    { label: '36 a 59 anos', min: 36, max: 59 },
    { label: '60+ anos', min: 60, max: null }
  ];

  // =========================================================================
  // Filtros
  // =========================================================================

  function normalizarFiltros(params) {
    params = params || {};
    return {
      empresa: paraIdOuNull(params.empresa),
      filial: paraIdOuNull(params.filial),
      produto: paraIdOuNull(params.produto),
      parentesco: paraIdOuNull(params.parentesco),
      status: paraStatus(params.status)
    };
  }

  function paraIdOuNull(valor) {
    if (valor === undefined || valor === null) return null;
    valor = String(valor).trim();
    if (valor === '' || valor === 'null' || valor === 'undefined') return null;
    var n = parseInt(valor, 10);
    return isNaN(n) ? null : n;
  }

  function paraStatus(valor) {
    valor = valor === undefined || valor === null ? '' : String(valor).trim().toLowerCase();
    if (valor === 'ativo' || valor === 'inativo') return valor;
    return null;
  }

  function countOrZero(row) {
    if (!row) return 0;
    var v = row['count'];
    if (v === undefined || v === null) v = row['COUNT'];
    return v ? Number(v) : 0;
  }

  function seriesFromGrouped(rows, labelKey) {
    var lista = [];
    var total = [];
    (rows || []).forEach(function(item) {
      var label = item[labelKey] || item[labelKey.toLowerCase()] || 'Não informado';
      var n = countOrZero(item);
      if (n > 0) {
        lista.push(String(label));
        total.push(n);
      }
    });
    return { lista: lista, total: total };
  }

  // =========================================================================
  // Base comum de BRH_DEPENDENTE (join com o titular BRH_COLABORADOR) com
  // os filtros da tela aplicados.
  // =========================================================================

  function dependenteBase(filtros) {
    filtros = filtros || {};
    var q = src.require('knex')('BRH_DEPENDENTE D')
      .join('BRH_COLABORADOR C', 'C.ID_BRH_COLABORADOR = D.ID_BRH_COLABORADOR');
    if (filtros.empresa) q = q.andWhere('C.ID_BRH_EMPRESA', filtros.empresa);
    if (filtros.filial) q = q.andWhere('C.ID_BRH_FILIAL', filtros.filial);
    if (filtros.parentesco) q = q.andWhere('D.ID_BRH_GRAU_PARENTESCO', filtros.parentesco);
    if (filtros.status === 'ativo') q = q.whereNull('D.DT_EXCLUSAO');
    if (filtros.status === 'inativo') q = q.whereNotNull('D.DT_EXCLUSAO');
    // filtros.produto já passou por paraIdOuNull (garantido inteiro), por
    // isso é seguro concatenar direto no whereRaw — mesmo padrão usado no
    // dashboard de Colaboradores pra valores numéricos validados.
    if (filtros.produto) {
      q = q.whereRaw(
        "EXISTS (SELECT 1 FROM BRH_BENEFICIO_DEPENDENTE BDP " +
        "JOIN BRH_BENEFICIO BP ON BP.ID_BRH_BENEFICIO = BDP.ID_BRH_BENEFICIO " +
        "JOIN BRH_CONTRATO_PLANO CPP ON CPP.ID_BRH_CONTRATO_PLANO = BP.ID_BRH_CONTRATO_PLANO " +
        "JOIN BRH_PLANO PLP ON PLP.ID_BRH_PLANO = CPP.ID_BRH_PLANO " +
        "WHERE BDP.ID_BRH_DEPENDENTE = D.ID_BRH_DEPENDENTE AND PLP.ID_BRH_PRODUTO = " + filtros.produto + ")"
      );
    }
    return q;
  }

  // "Ativo" = sem data de exclusão do cadastro (ver ATENÇÃO no topo do arquivo).
  function dependenteAtivoBase(filtros) {
    return dependenteBase(filtros).whereNull('D.DT_EXCLUSAO');
  }

  // Vínculo de benefício em vigência (nem o item do dependente, nem o
  // benefício do titular, já venceram). Ver ATENÇÃO no topo do arquivo.
  function existsBeneficioAtivoSql(aliasDependente) {
    return "EXISTS (SELECT 1 FROM BRH_BENEFICIO_DEPENDENTE BD2 " +
      "JOIN BRH_BENEFICIO B2 ON B2.ID_BRH_BENEFICIO = BD2.ID_BRH_BENEFICIO " +
      "WHERE BD2.ID_BRH_DEPENDENTE = " + aliasDependente + ".ID_BRH_DEPENDENTE " +
      "AND (BD2.DT_TERMINOVIGENCIA IS NULL OR BD2.DT_TERMINOVIGENCIA >= CURRENT_DATE) " +
      "AND (B2.DT_TERMINOVIGENCIA IS NULL OR B2.DT_TERMINOVIGENCIA >= CURRENT_DATE))";
  }

  // Colaboradores ativos (quadro atual) — usado só pra calcular a média de
  // dependentes por titular. Réplica reduzida do critério usado no
  // dashboard de Colaboradores (colaboradorAtivoBase), sem duplicar o
  // módulo inteiro só por causa dessa única métrica.
  function colaboradoresAtivosCount(filtros) {
    var q = src.require('knex')('BRH_COLABORADOR C')
      .where("C.OP_TESTE != 'Y' OR C.OP_TESTE IS NULL")
      .whereNull('C.DT_DESLIGAMENTO');
    if (filtros.empresa) q = q.andWhere('C.ID_BRH_EMPRESA', filtros.empresa);
    if (filtros.filial) q = q.andWhere('C.ID_BRH_FILIAL', filtros.filial);
    return countOrZero(q.select('COUNT(*) AS [count]').find().first());
  }

  // =========================================================================
  // KPIs
  // =========================================================================

  function obterKpis(filtros) {
    var cadastrados = countOrZero(
      dependenteBase(filtros).select('COUNT(*) AS [count]').find().first()
    );

    var ativos = countOrZero(
      dependenteAtivoBase(filtros).select('COUNT(*) AS [count]').find().first()
    );

    var comBeneficio = countOrZero(
      dependenteBase(filtros)
        .whereRaw(existsBeneficioAtivoSql('D'))
        .select('COUNT(*) AS [count]')
        .find().first()
    );

    var semBeneficio = cadastrados - comBeneficio;
    if (semBeneficio < 0) semBeneficio = 0;

    var colaboradoresAtivos = colaboradoresAtivosCount(filtros);
    var media = colaboradoresAtivos ? (cadastrados / colaboradoresAtivos) : 0;

    return {
      dependentesCadastrados: cadastrados,
      dependentesAtivos: ativos,
      comBeneficio: comBeneficio,
      semBeneficio: semBeneficio,
      mediaPorTitular: Math.round(media * 100) / 100
    };
  }

  // =========================================================================
  // Dependentes por tipo de benefício (barra) — conta vínculos ativos em
  // BRH_BENEFICIO_DEPENDENTE agrupados por BRH_TIPO_PRODUTO. Um mesmo
  // dependente pode aparecer em mais de uma categoria (ex.: saúde e
  // odontológico), por isso a soma das barras pode passar do total de
  // dependentes cadastrados.
  // =========================================================================

  function obterPorTipoBeneficio(filtros) {
    var rows = dependenteBase(filtros)
      .join('BRH_BENEFICIO_DEPENDENTE BD', 'BD.ID_BRH_DEPENDENTE = D.ID_BRH_DEPENDENTE')
      .join('BRH_BENEFICIO B', 'B.ID_BRH_BENEFICIO = BD.ID_BRH_BENEFICIO')
      .join('BRH_CONTRATO_PLANO CP', 'CP.ID_BRH_CONTRATO_PLANO = B.ID_BRH_CONTRATO_PLANO')
      .join('BRH_PLANO PL', 'PL.ID_BRH_PLANO = CP.ID_BRH_PLANO')
      .join('BRH_PRODUTO PR', 'PR.ID_BRH_PRODUTO = PL.ID_BRH_PRODUTO')
      .leftJoin('BRH_TIPO_PRODUTO TP', 'TP.ID_BRH_TIPO_PRODUTO = PR.ID_BRH_TIPO_PRODUTO')
      .whereRaw('(BD.DT_TERMINOVIGENCIA IS NULL OR BD.DT_TERMINOVIGENCIA >= CURRENT_DATE)')
      .whereRaw('(B.DT_TERMINOVIGENCIA IS NULL OR B.DT_TERMINOVIGENCIA >= CURRENT_DATE)')
      .select("COALESCE(TP.DS_NOME, 'Não informado') AS label", 'COUNT(*) AS [count]')
      .groupBy("COALESCE(TP.DS_NOME, 'Não informado')")
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  // =========================================================================
  // Dependentes por grau de parentesco (donut) — todos os cadastrados
  // (não só ativos), pra refletir o perfil completo da base.
  // =========================================================================

  function obterPorGrauParentesco(filtros) {
    var rows = dependenteBase(filtros)
      .leftJoin('BRH_GRAU_PARENTESCO GP', 'GP.ID_BRH_GRAU_PARENTESCO = D.ID_BRH_GRAU_PARENTESCO')
      .select("COALESCE(GP.DS_NOME, 'Não informado') AS label", 'COUNT(*) AS [count]')
      .groupBy("COALESCE(GP.DS_NOME, 'Não informado')")
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  // =========================================================================
  // Dependentes por faixa etária (barra horizontal) — usa NR_IDADE já
  // calculado em BRH_DEPENDENTE. Faixas fixas (não vêm de filtro).
  // =========================================================================

  function obterPorFaixaEtaria(filtros) {
    var lista = [];
    var total = [];
    FAIXAS_ETARIAS.forEach(function(faixa) {
      var q = dependenteBase(filtros).whereRaw('D.NR_IDADE >= ' + faixa.min);
      if (faixa.max !== null) q = q.whereRaw('D.NR_IDADE <= ' + faixa.max);
      var n = countOrZero(q.select('COUNT(*) AS [count]').find().first());
      lista.push(faixa.label);
      total.push(n);
    });
    return { lista: lista, total: total };
  }

  // =========================================================================
  // Distribuição dos dependentes: por empresa / filial / centro de custo
  // DO TITULAR (BRH_COLABORADOR ligado em BRH_DEPENDENTE.ID_BRH_COLABORADOR)
  // =========================================================================

  function obterPorEmpresa(filtros) {
    var rows = dependenteBase(filtros)
      .join('BRH_EMPRESA E', 'E.ID_BRH_EMPRESA = C.ID_BRH_EMPRESA')
      .whereRaw("COALESCE(E.DS_NOMEFANTASIA, '') <> 'Todas'")
      .select('E.DS_NOMEFANTASIA AS label', 'COUNT(*) AS [count]')
      .groupBy('E.DS_NOMEFANTASIA')
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  function obterPorFilial(filtros) {
    var rows = dependenteBase(filtros)
      .join('BRH_FILIAL F', 'F.ID_BRH_FILIAL = C.ID_BRH_FILIAL')
      .whereRaw("COALESCE(F.DS_NOMEFANTASIA, '') <> 'Todas'")
      .select('F.DS_NOMEFANTASIA AS label', 'COUNT(*) AS [count]')
      .groupBy('F.DS_NOMEFANTASIA')
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  function obterPorCentroCusto(filtros) {
    var rows = dependenteBase(filtros)
      .leftJoin('BRH_CENTRO_CUSTO CC', 'CC.ID_BRH_CENTRO_CUSTO = C.ID_BRH_CENTRO_CUSTO')
      .select("COALESCE(CC.DS_NOME, 'Não informado') AS label", 'COUNT(*) AS [count]')
      .groupBy("COALESCE(CC.DS_NOME, 'Não informado')")
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  // =========================================================================
  // Opções de filtro (dropdowns). "Status" não entra aqui — é uma lista
  // fixa (Ativo/Inativo) montada direto no HTML, não vem do banco.
  // =========================================================================

  function obterOpcoesFiltro() {
    var empresas = src.require('knex')('BRH_EMPRESA')
      .whereRaw("COALESCE(DS_NOMEFANTASIA, '') <> 'Todas'")
      .select('ID_BRH_EMPRESA AS [id]', 'DS_NOMEFANTASIA AS [nome]')
      .orderBy('DS_NOMEFANTASIA')
      .find();

    var filiais = src.require('knex')('BRH_FILIAL')
      .whereRaw("COALESCE(DS_NOMEFANTASIA, '') <> 'Todas'")
      .select('ID_BRH_FILIAL AS [id]', 'DS_NOMEFANTASIA AS [nome]', 'ID_BRH_EMPRESA AS [idEmpresa]')
      .orderBy('DS_NOMEFANTASIA')
      .find();

    // ATENÇÃO: BRH_PRODUTO tem OP_ATIVO, mas o domínio de valores não está
    // confirmado no DDL, então listo todos os produtos (sem filtrar por
    // ativo) pra não esconder produto por engano. Se quiser restringir,
    // acrescente aqui algo como .whereRaw("OP_ATIVO = 'Y'").
    var produtos = src.require('knex')('BRH_PRODUTO')
      .select('ID_BRH_PRODUTO AS [id]', 'DS_NOME AS [nome]')
      .orderBy('DS_NOME')
      .find();

    var parentescos = src.require('knex')('BRH_GRAU_PARENTESCO')
      .select('ID_BRH_GRAU_PARENTESCO AS [id]', 'DS_NOME AS [nome]')
      .orderBy('DS_NOME')
      .find();

    return {
      empresas: empresas,
      filiais: filiais,
      produtos: produtos,
      parentescos: parentescos
    };
  }

  // =========================================================================
  // Agregador — chamado pelo endpoint principal do dashboard
  // =========================================================================

  function obterDados(paramsBrutos) {
    var filtros = normalizarFiltros(paramsBrutos);

    return {
      atualizadoEm: src.require('now')().format('dd/MM/yyyy HH:mm'),
      filtrosAplicados: filtros,
      kpis: obterKpis(filtros),
      porTipoBeneficio: obterPorTipoBeneficio(filtros),
      porGrauParentesco: obterPorGrauParentesco(filtros),
      porFaixaEtaria: obterPorFaixaEtaria(filtros),
      porEmpresa: obterPorEmpresa(filtros),
      porFilial: obterPorFilial(filtros),
      porCentroCusto: obterPorCentroCusto(filtros)
    };
  }

  return {
    'obterDados': obterDados,
    'obterOpcoesFiltro': obterOpcoesFiltro
  };
})();