/*
 * DashboardColaborador
 * durr.main.dev.dashboard.colaborador
 * 
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.dashboard.colaborador');

  var src = require('plusoftcrm.libs.main.source')({
    'now': 'plusoftcrm.libs.main.now'
  });  
 
  /*
 * DashboardColaboradoresUtils
 * brhain.rh.main.utils.dashboardColaboradores
 *
 * Queries do dashboard "Colaboradores" (composição, movimentação e
 * estrutura do quadro). Segue o mesmo padrão de brhain.rh.main.utils.dashboard
 * (DashHomeUtils.js): knex direto, funções pequenas por bloco do dashboard,
 * seriesFromGrouped() para virar { lista, total } pronto pro Chart.js.
 *
 * NOVO em relação ao dashboard de referência: todo bloco aceita um objeto
 * de filtros (empresa, filial, departamento, situacao, meses) vindo dos
 * dropdowns da tela. IDs de filtro são aplicados via .andWhere (bind
 * seguro); os únicos valores concatenados direto em whereRaw são números
 * (mês/ano) e datas calculadas no próprio servidor — nunca texto vindo do
 * cliente.
 */

  var NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  var MESES_PERMITIDOS = [3, 6, 12, 24];
  var MESES_PADRAO = 12;

  // =========================================================================
  // Filtros
  // =========================================================================

  // Normaliza o que chega da querystring (tudo string, campo pode vir
  // ausente/'' quando o dropdown está em "Todas"/"Todos").
  function normalizarFiltros(params) {
    params = params || {};
    return {
      empresa: paraIdOuNull(params.empresa),
      filial: paraIdOuNull(params.filial),
      departamento: paraIdOuNull(params.departamento),
      situacao: paraIdOuNull(params.situacao),
      meses: paraMeses(params.meses)
    };
  }

  function paraIdOuNull(valor) {
    if (valor === undefined || valor === null) return null;
    valor = String(valor).trim();
    if (valor === '' || valor === 'null' || valor === 'undefined') return null;
    var n = parseInt(valor, 10);
    return isNaN(n) ? null : n;
  }

  function paraMeses(valor) {
    var n = parseInt(valor, 10);
    if (MESES_PERMITIDOS.indexOf(n) === -1) return MESES_PADRAO;
    return n;
  }

  // Base comum de BRH_COLABORADOR com os filtros da tela aplicados.
  // Não filtra por situação "ativo" — quem precisa disso usa colaboradorAtivoBase.
  function colaboradorBase(filtros) {
    filtros = filtros || {};
    var q = src.require('knex')('BRH_COLABORADOR A')
      .where("A.OP_TESTE != 'Y' OR A.OP_TESTE IS NULL");
    if (filtros.empresa) q = q.andWhere('A.ID_BRH_EMPRESA', filtros.empresa);
    if (filtros.filial) q = q.andWhere('A.ID_BRH_FILIAL', filtros.filial);
    if (filtros.departamento) q = q.andWhere('A.ID_BRH_DEPARTAMENTO', filtros.departamento);
    if (filtros.situacao) q = q.andWhere('A.ID_BRH_SITUACAO_COLABORADOR', filtros.situacao);
    return q;
  }

  // "Ativo" = quadro atual, sem data de desligamento. É o critério usado
  // pra todo KPI/gráfico que representa o quadro "hoje" (não o histórico).
  function colaboradorAtivoBase(filtros) {
    return colaboradorBase(filtros).whereNull('A.DT_DESLIGAMENTO');
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

  // yyyy-mm-dd, pra embutir em whereRaw sem depender de lib de data.
  // Sem usar padStart (evitar depender de método ES2017 recente no engine
  // de script do lowcode) — monta com concatenação simples.
  function doisDigitos(numero) {
    var texto = String(numero);
    if (texto.length < 2) {
      texto = '0' + texto;
    }
    return texto;
  }

  function paraDataSql(date) {
    var ano = date.getFullYear();
    var mes = doisDigitos(date.getMonth() + 1);
    var dia = doisDigitos(date.getDate());
    return ano + '-' + mes + '-' + dia;
  }

  function ultimoDiaDoMes(ano, mesIndexZeroBased) {
    // dia 0 do mês seguinte = último dia do mês atual
    return new Date(ano, mesIndexZeroBased + 1, 0);
  }

  // =========================================================================
  // KPIs
  // =========================================================================

  function obterKpis(filtros) {
    var hoje = new Date();
    var inicioPeriodo = new Date();
    inicioPeriodo.setMonth(hoje.getMonth() - filtros.meses);
    var inicioPeriodoSql = paraDataSql(inicioPeriodo);
    var hojeSql = paraDataSql(hoje);

    var colaboradoresAtivos = countOrZero(
      colaboradorAtivoBase(filtros).select('COUNT(*) AS [count]').find().first()
    );

    var admitidosNoPeriodo = countOrZero(
      colaboradorBase(filtros)
        .whereRaw("A.DT_ADMISSAO >= '" + inicioPeriodoSql + "'")
        .whereRaw("A.DT_ADMISSAO <= '" + hojeSql + "'")
        .select('COUNT(*) AS [count]')
        .find().first()
    );

    var desligadosNoPeriodo = countOrZero(
      colaboradorBase(filtros)
        .whereRaw("A.DT_DESLIGAMENTO >= '" + inicioPeriodoSql + "'")
        .whereRaw("A.DT_DESLIGAMENTO <= '" + hojeSql + "'")
        .select('COUNT(*) AS [count]')
        .find().first()
    );

    var gestores = countOrZero(
      colaboradorAtivoBase(filtros)
        .andWhere('A.DO_GESTOR', 'Y')
        .select('COUNT(*) AS [count]')
        .find().first()
    );

    // ATENÇÃO: tempo médio de empresa usa DT_ADMISSAO (data de admissão
    // vigente no cadastro). Se o time de RH considerar DT_INICIOEMPRESA
    // (campo separado em BRH_COLABORADOR, existe pra casos de
    // transferência/sucessão de empresa) mais correto pra essa métrica,
    // troque só essa coluna abaixo.
    var diasMedios = colaboradorAtivoBase(filtros)
      .whereRaw('A.DT_ADMISSAO IS NOT NULL')
      .select("AVG(CURRENT_DATE - A.DT_ADMISSAO) AS [dias]")
      .find().first();
    var tempoMedioAnos = diasMedios && diasMedios['dias'] ? Number(diasMedios['dias']) / 365.25 : 0;

    return {
      colaboradoresAtivos: colaboradoresAtivos,
      admitidosNoPeriodo: admitidosNoPeriodo,
      desligadosNoPeriodo: desligadosNoPeriodo,
      gestores: gestores,
      tempoMedioEmpresaAnos: Math.round(tempoMedioAnos * 10) / 10
    };
  }

  // =========================================================================
  // Evolução do quadro (admissões, desligamentos e total, mês a mês)
  // =========================================================================

  function obterEvolucaoQuadro(filtros) {
    var hoje = new Date();
    var dataBase = new Date();
    dataBase.setMonth(hoje.getMonth() - (filtros.meses - 1));

    var meses = [];
    var admissoes = [];
    var desligamentos = [];
    var totalColaboradores = [];

    for (var i = 0; i < filtros.meses; i++) {
      var dataCalculada = new Date(dataBase.getFullYear(), dataBase.getMonth() + i, 1);
      var ano = dataCalculada.getFullYear();
      var mesIndex = dataCalculada.getMonth(); // 0-based
      var mesNumero = mesIndex + 1;
      var fimMes = ultimoDiaDoMes(ano, mesIndex);
      var fimMesSql = paraDataSql(fimMes);

      meses.push(NOMES_MES[mesIndex] + '/' + String(ano).slice(-2));

      admissoes.push(countOrZero(
        colaboradorBase(filtros)
          .whereRaw('EXTRACT(MONTH FROM A.DT_ADMISSAO) = ' + mesNumero)
          .whereRaw('EXTRACT(YEAR FROM A.DT_ADMISSAO) = ' + ano)
          .select('COUNT(*) AS [count]')
          .find().first()
      ));

      desligamentos.push(countOrZero(
        colaboradorBase(filtros)
          .whereRaw('EXTRACT(MONTH FROM A.DT_DESLIGAMENTO) = ' + mesNumero)
          .whereRaw('EXTRACT(YEAR FROM A.DT_DESLIGAMENTO) = ' + ano)
          .select('COUNT(*) AS [count]')
          .find().first()
      ));

      // Quadro "como estava" no fim daquele mês: já admitido e (ainda sem
      // desligamento, ou desligado só depois do fim do mês).
      totalColaboradores.push(countOrZero(
        colaboradorBase(filtros)
          .whereRaw("A.DT_ADMISSAO <= '" + fimMesSql + "'")
          .whereRaw("(A.DT_DESLIGAMENTO IS NULL OR A.DT_DESLIGAMENTO > '" + fimMesSql + "')")
          .select('COUNT(*) AS [count]')
          .find().first()
      ));
    }

    return {
      meses: meses,
      admissoes: admissoes,
      desligamentos: desligamentos,
      totalColaboradores: totalColaboradores
    };
  }

  // =========================================================================
  // Colaboradores por situação (donut) — só quadro ativo
  // =========================================================================

  function obterPorSituacao(filtros) {
    var rows = colaboradorAtivoBase(filtros)
      .leftJoin('BRH_SITUACAO_COLABORADOR S', 'S.ID_BRH_SITUACAO_COLABORADOR = A.ID_BRH_SITUACAO_COLABORADOR')
      .select("COALESCE(S.DS_NOME, 'Não informado') AS label", 'COUNT(*) AS [count]')
      .groupBy("COALESCE(S.DS_NOME, 'Não informado')")
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  // =========================================================================
  // Colaboradores por departamento (barra horizontal) — quadro ativo
  // =========================================================================

  function obterPorDepartamento(filtros) {
    var rows = colaboradorAtivoBase(filtros)
      .leftJoin('BRH_DEPARTAMENTO D', 'D.ID_BRH_DEPARTAMENTO = A.ID_BRH_DEPARTAMENTO')
      .select("COALESCE(D.DS_NOME, 'Não informado') AS label", 'COUNT(*) AS [count]')
      .groupBy("COALESCE(D.DS_NOME, 'Não informado')")
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  // =========================================================================
  // Distribuição dos colaboradores: por empresa / filial / centro de custo
  // (quadro ativo)
  // =========================================================================

  function obterPorEmpresa(filtros) {
    var rows = colaboradorAtivoBase(filtros)
      .join('BRH_EMPRESA E', 'E.ID_BRH_EMPRESA = A.ID_BRH_EMPRESA')
      .whereRaw("COALESCE(E.DS_NOMEFANTASIA, '') <> 'Todas'")
      .select('E.DS_NOMEFANTASIA AS label', 'COUNT(*) AS [count]')
      .groupBy('E.DS_NOMEFANTASIA')
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  function obterPorFilial(filtros) {
    var rows = colaboradorAtivoBase(filtros)
      .join('BRH_FILIAL F', 'F.ID_BRH_FILIAL = A.ID_BRH_FILIAL')
      .whereRaw("COALESCE(F.DS_NOMEFANTASIA, '') <> 'Todas'")
      .select('F.DS_NOMEFANTASIA AS label', 'COUNT(*) AS [count]')
      .groupBy('F.DS_NOMEFANTASIA')
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  function obterPorCentroCusto(filtros) {
    var rows = colaboradorAtivoBase(filtros)
      .leftJoin('BRH_CENTRO_CUSTO CC', 'CC.ID_BRH_CENTRO_CUSTO = A.ID_BRH_CENTRO_CUSTO')
      .select("COALESCE(CC.DS_NOME, 'Não informado') AS label", 'COUNT(*) AS [count]')
      .groupBy("COALESCE(CC.DS_NOME, 'Não informado')")
      .orderBy('COUNT(*)', 'desc')
      .find();
    return seriesFromGrouped(rows, 'label');
  }

  // =========================================================================
  // Opções de filtro (dropdowns)
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

    var departamentos = src.require('knex')('BRH_DEPARTAMENTO')
      .select('ID_BRH_DEPARTAMENTO AS [id]', 'DS_NOME AS [nome]')
      .orderBy('DS_NOME')
      .find();

    var situacoes = src.require('knex')('BRH_SITUACAO_COLABORADOR')
      .select('ID_BRH_SITUACAO_COLABORADOR AS [id]', 'DS_NOME AS [nome]')
      .orderBy('DS_NOME')
      .find();

    return {
      empresas: empresas,
      filiais: filiais,
      departamentos: departamentos,
      situacoes: situacoes,
      meses: MESES_PERMITIDOS
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
      evolucaoQuadro: obterEvolucaoQuadro(filtros),
      porSituacao: obterPorSituacao(filtros),
      porDepartamento: obterPorDepartamento(filtros),
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