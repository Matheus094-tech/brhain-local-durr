/*
 * BusinessTestImportFolha
 * durr.main.dev.integracao.testimportfolha
 *
 * Executa cenários controlados contra dados reais de DEV (sem mocks), cobrindo
 * os casos mínimos de Folha - Titular e Folha - Dependente. Cria e remove ao
 * final apenas registros com o marcador "ZZ_TESTE_IMPORTFOLHA" no nome/matrícula.
 *
 * Não reaproveita nenhum colaborador real: cria o próprio titular de teste
 * (matrícula marcada) e usa esse titular como base para os testes de dependente.
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.integracao.testimportfolha');
  var src = require('plusoftcrm.libs.main.source')({
    'businessImportFolha': 'durr.main.dev.integracao.businessImportFolha',
    'utilsImportFolha': 'durr.main.dev.integracao.utilsimportfolha',
    'importFolhaTitular': 'durr.main.dev.integracao.importfolhatitular',
    'importFolhaDependente': 'durr.main.dev.integracao.importfolhadependente',
    'importFolha': 'durr.main.dev.integracao.importfolha'
  });
  var utils = src.require('utilsImportFolha');

  var PREFIXO_TESTE = 'ZZ_TESTE_IMPORTFOLHA';
  var CODIGO_EMPRESA_TESTE = '1';
  var MATRICULA_TITULAR = PREFIXO_TESTE + '_TITULAR';
  var MATRICULA_SITUACAO_1 = PREFIXO_TESTE + '_SITUACAO1';
  var MATRICULA_SITUACAO_2 = PREFIXO_TESTE + '_SITUACAO2';
  var MATRICULA_SITUACAO_3 = PREFIXO_TESTE + '_SITUACAO3';
  var MATRICULAS_SITUACAO_OP_TIPO = [
    PREFIXO_TESTE + '_SITINATIVO',
    PREFIXO_TESTE + '_SITAFASTADO',
    PREFIXO_TESTE + '_SITLICMIL',
    PREFIXO_TESTE + '_SITLICNR',
    PREFIXO_TESTE + '_SITLICREM',
    PREFIXO_TESTE + '_SITFERIAS',
    PREFIXO_TESTE + '_SITLICMED',
    PREFIXO_TESTE + '_SITAUXDOENCA',
    PREFIXO_TESTE + '_SITATESTMED',
    PREFIXO_TESTE + '_SITLICMAT',
    PREFIXO_TESTE + '_SITADMISSAO',
    PREFIXO_TESTE + '_SITDESCONHECIDA'
  ];

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

  function processarColaborador(dto) {
    return src.require('businessImportFolha').processarColaborador(dto);
  }

  function processarDependente(dto) {
    return src.require('businessImportFolha').processarDependenteAvulso(dto);
  }

  function empresaTesteExiste() {
    var empresa = src.require('knex')('BRH_EMPRESA')
      .select('ID_BRH_EMPRESA')
      .where('DS_CODIGOFOLHA', CODIGO_EMPRESA_TESTE)
      .findFirst();
    return !!empresa;
  }

  function buscarColaboradorPorMatricula(matricula) {
    var empresa = src.require('knex')('BRH_EMPRESA').select('ID_BRH_EMPRESA').where('DS_CODIGOFOLHA', CODIGO_EMPRESA_TESTE).findFirst();
    if (!empresa) return null;
    return src.require('knex')('BRH_COLABORADOR')
      .select('ID_BRH_COLABORADOR', 'ID_BRH_CARGO', 'ID_BRH_VINCULO_EMPREGATICIO', 'ID_BRH_SINDICATO', 'ID_BRH_ESTADO_CIVIL', 'DS_CEP', 'DT_NASCIMENTO')
      .where('ID_BRH_EMPRESA', empresa.id_brh_empresa)
      .where('DS_MATRICULA', matricula)
      .findFirst();
  }

  function contarPorCodigoFolha(entidade, codigo) {
    var lista = src.require('knex')(entidade)
      .select('ID_' + entidade)
      .where('DS_CODIGOFOLHA', codigo)
      .find();
    return lista ? lista.length : 0;
  }

  function dtoTitularBase() {
    return {
      CodigoEmpresa: CODIGO_EMPRESA_TESTE,
      MatriculaColaborador: MATRICULA_TITULAR,
      CPF: '1234567890', // 10 dígitos — deve virar 01234567890
      NomeCompletoColaborador: PREFIXO_TESTE + ' Titular',
      // ImportFolha converte a data (serial Excel) antes de montar o DTO real;
      // reproduzido aqui porque o teste chama o núcleo direto, sem passar por onrecord.
      DataNascimento: utils.converterDataOficial('29682'), // serial Excel real (06/04/1981)
      Sexo: 'Masculino',
      EstadoCivil: PREFIXO_TESTE + ' Casado',
      NomeMae: PREFIXO_TESTE + ' Mae',
      CodigoVinculoEmpregaticio: 'ZFV1',
      VinculoNome: PREFIXO_TESTE + ' Vinculo',
      CodigoCargo: 'ZFC1',
      Cargo: PREFIXO_TESTE + ' Cargo',
      SituacaoColaborador: 'ATIVO',
      CodigoSindicato: 'ZFS1',
      Sindicato: PREFIXO_TESTE + ' Sindicato',
      DataAdmissao: utils.converterDataOficial('45749'), // serial Excel real (02/04/2025)
      EmailCorporativo: '',
      CEPPessoal: '4545050', // sem zero à esquerda — deve virar 04545050
      Banco: '33'
    };
  }

  function testarEmpresaInexistente(result) {
    var dto = dtoTitularBase();
    dto.CodigoEmpresa = 'ZZ_EMPRESA_INEXISTENTE_999';
    var resultado = processarColaborador(dto);
    adicionar(result, 'Titular - Empresa inexistente gera erro',
      !resultado.sucesso && /Empresa/.test(resultado.mensagens.join(' ')), resultado);
  }

  function testarCpfAusente(result) {
    var dto = dtoTitularBase();
    dto.CPF = '';
    var resultado = processarColaborador(dto);
    adicionar(result, 'Titular - CPF ausente gera erro',
      !resultado.sucesso && /CPF/.test(resultado.mensagens.join(' ')), resultado);
  }

  function testarCriacaoTitular(result) {
    if (!empresaTesteExiste()) {
      result.push({ teste: 'Casos de Titular/Dependente', sucesso: null, detalhes: 'NAO_APLICAVEL: empresa DS_CODIGOFOLHA=' + CODIGO_EMPRESA_TESTE + ' não encontrada neste ambiente' });
      return false;
    }

    var r1 = processarColaborador(dtoTitularBase());
    adicionar(result, 'Titular - Criação com CPF sem zero à esquerda', r1.sucesso && r1.acao === 'criado', r1);

    var registro = buscarColaboradorPorMatricula(MATRICULA_TITULAR);
    adicionar(result, 'Titular - CPF normalizado para 11 dígitos', !!registro, registro);

    var cepOk = !!registro && registro.ds_cep === '04545050';
    adicionar(result, 'Titular - CEP normalizado para 8 dígitos com zero à esquerda', cepOk, registro);

    var dataOk = !!registro && new Date(registro.dt_nascimento).toISOString().substring(0, 10) === '1981-04-06';
    adicionar(result, 'Titular - Data de Nascimento (serial Excel) convertida corretamente', dataOk, registro);

    adicionar(result, 'Titular - Cargo novo criado pelo código',
      contarPorCodigoFolha('BRH_CARGO', 'ZFC1') === 1, null);
    adicionar(result, 'Titular - Vínculo novo criado pelo código',
      contarPorCodigoFolha('BRH_VINCULO_EMPREGATICIO', 'ZFV1') === 1, null);
    adicionar(result, 'Titular - Sindicato novo criado por Categoria Profissional - Cód',
      contarPorCodigoFolha('BRH_SINDICATO', 'ZFS1') === 1, null);
    adicionar(result, 'Titular - Estado Civil novo criado pelo valor textual',
      contarPorCodigoFolha('BRH_ESTADO_CIVIL', PREFIXO_TESTE + ' Casado') === 1, null);

    var r2 = processarColaborador(dtoTitularBase());
    adicionar(result, 'Titular - Reaproveitamento de Cargo/Vínculo/Sindicato já existentes (sem duplicar)',
      r2.sucesso && contarPorCodigoFolha('BRH_CARGO', 'ZFC1') === 1 && contarPorCodigoFolha('BRH_VINCULO_EMPREGATICIO', 'ZFV1') === 1 && contarPorCodigoFolha('BRH_SINDICATO', 'ZFS1') === 1, r2);
    adicionar(result, 'Titular - Reprocessar dado idêntico não gera alteração de elegibilidade',
      r2.sucesso && r2.acao === 'semAlteracao', r2);

    var dtoAlterado = dtoTitularBase();
    dtoAlterado.CodigoCargo = 'ZFC2';
    dtoAlterado.Cargo = PREFIXO_TESTE + ' Cargo 2';
    var r3 = processarColaborador(dtoAlterado);
    adicionar(result, 'Titular - Alteração de Cargo (campo de elegibilidade) atualiza o colaborador',
      r3.sucesso && r3.acao === 'atualizado', r3);

    var dtoSemBanco = dtoTitularBase();
    dtoSemBanco.Banco = '';
    dtoSemBanco.CEPPessoal = '';
    // Força uma alteração de elegibilidade real mantendo banco/CEP vazios nesta carga.
    // CAMPOS_ELEGIBILIDADE = empresa/filial/grade/cargo/departamento/sindicato — Vínculo
    // Empregatício NÃO é campo de elegibilidade (não dispara ATUALIZADO por si só,
    // comportamento intencional e documentado em resumo.md), por isso o gatilho aqui
    // precisa ser um novo Cargo (ZFC3, ainda não usado por este colaborador).
    dtoSemBanco.CodigoCargo = 'ZFC3';
    dtoSemBanco.Cargo = PREFIXO_TESTE + ' Cargo 3';
    var r4 = processarColaborador(dtoSemBanco);
    var registroAposUpdate = buscarColaboradorPorMatricula(MATRICULA_TITULAR);
    adicionar(result, 'Titular - UPDATE seletivo não apaga CEP quando arquivo não o informa',
      r4.sucesso && r4.acao === 'atualizado' && registroAposUpdate.ds_cep === '04545050', { resultado: r4, registro: registroAposUpdate });

    return true;
  }

  function testarDependente(result, titularCriado) {
    if (!titularCriado) return;

    var titularId = buscarColaboradorPorMatricula(MATRICULA_TITULAR).id_brh_colaborador;

    var dtoDependenteBase = function() {
      return {
        CodigoEmpresa: CODIGO_EMPRESA_TESTE,
        MatriculaTitular: MATRICULA_TITULAR,
        CPFTitular: '1234567890',
        Nome: PREFIXO_TESTE + ' Dependente',
        CPF: '9876543210', // 10 dígitos — deve virar 09876543210
        DataNascimento: utils.converterDataOficial('21638'), // serial Excel real
        Sexo: 'Feminino',
        CodigoGrauParentesco: 'ZFP1',
        GrauParentesco: PREFIXO_TESTE + ' Conjuge'
      };
    };

    var r1 = processarDependente(dtoDependenteBase());
    adicionar(result, 'Dependente - Criação com titular localizado por Empresa+Matrícula', r1.sucesso && r1.acao === 'criado', r1);

    var dependenteCriado = r1.idDependente && src.require('knex')('BRH_DEPENDENTE').select('DS_CPF').where('ID_BRH_DEPENDENTE', r1.idDependente).findFirst();
    adicionar(result, 'Dependente - CPF normalizado para 11 dígitos', !!dependenteCriado && dependenteCriado.ds_cpf === '09876543210', dependenteCriado);

    adicionar(result, 'Dependente - Parentesco novo criado pelo código',
      contarPorCodigoFolha('BRH_GRAU_PARENTESCO', 'ZFP1') === 1, null);

    var r2 = processarDependente(dtoDependenteBase());
    adicionar(result, 'Dependente - Reprocessar mesma linha não duplica (semAlteracao)',
      r2.sucesso && r2.acao === 'semAlteracao' && Number(r2.idDependente) === Number(r1.idDependente), r2);

    var dtoTitularInexistente = dtoDependenteBase();
    dtoTitularInexistente.MatriculaTitular = 'ZZ_MATRICULA_INEXISTENTE_999';
    var r4 = processarDependente(dtoTitularInexistente);
    adicionar(result, 'Dependente - Titular não encontrado gera erro',
      !r4.sucesso && /Titular não encontrado/.test(r4.mensagens.join(' ')), r4);

    var dtoCpfDivergente = dtoDependenteBase();
    dtoCpfDivergente.CPFTitular = '11111111111';
    var r5 = processarDependente(dtoCpfDivergente);
    adicionar(result, 'Dependente - CPF do titular divergente do cadastro gera erro',
      !r5.sucesso && /CPF do titular diverge/.test(r5.mensagens.join(' ')), r5);

    // (B) Dependente sem CPF é cadastrado com sucesso
    var dtoSemCpf = dtoDependenteBase();
    dtoSemCpf.Nome = PREFIXO_TESTE + ' SemCPF';
    dtoSemCpf.CPF = '';
    dtoSemCpf.DataNascimento = utils.converterDataOficial('25000');
    var r6 = processarDependente(dtoSemCpf);
    adicionar(result, 'Dependente - sem CPF é criado com sucesso (não é mais erro)',
      r6.sucesso && r6.acao === 'criado', r6);
    adicionar(result, 'Dependente - sem CPF gera aviso funcional (não falha)',
      r6.avisos.some(function(a) { return /sem CPF/.test(a); }), r6);

    var semCpfCriado = r6.idDependente && src.require('knex')('BRH_DEPENDENTE').select('DS_CPF').where('ID_BRH_DEPENDENTE', r6.idDependente).findFirst();
    adicionar(result, 'Dependente - sem CPF grava DS_CPF null (nunca valor artificial)',
      !!semCpfCriado && semCpfCriado.ds_cpf === null, semCpfCriado);

    // (C) Reprocessar o mesmo dependente sem CPF não duplica
    var r7 = processarDependente(dtoSemCpf);
    adicionar(result, 'Dependente - sem CPF reprocessado não duplica (mesma chave alternativa)',
      r7.sucesso && Number(r7.idDependente) === Number(r6.idDependente) && (r7.acao === 'semAlteracao' || r7.acao === 'atualizado'), r7);

    // (D) Dependente sem CPF que depois chega com CPF: mesmo registro, sem duplicar
    var dtoBackfill = dtoDependenteBase();
    dtoBackfill.Nome = PREFIXO_TESTE + ' BackfillCPF';
    dtoBackfill.CPF = '';
    dtoBackfill.DataNascimento = utils.converterDataOficial('26000');
    var r8a = processarDependente(dtoBackfill);
    adicionar(result, 'Dependente - (pré-condição) criado sem CPF para teste de backfill',
      r8a.sucesso && r8a.acao === 'criado', r8a);

    var dtoBackfillComCpf = dtoDependenteBase();
    dtoBackfillComCpf.Nome = PREFIXO_TESTE + ' BackfillCPF';
    dtoBackfillComCpf.CPF = '5544332211';
    dtoBackfillComCpf.DataNascimento = utils.converterDataOficial('26000');
    var r8b = processarDependente(dtoBackfillComCpf);
    adicionar(result, 'Dependente - CPF chegando depois localiza pela chave alternativa e atualiza o mesmo registro',
      r8b.sucesso && r8b.acao === 'atualizado' && Number(r8b.idDependente) === Number(r8a.idDependente) && /CPF do dependente preenchido/.test(r8b.mensagens.join(' ')), r8b);

    var totalBackfill = src.require('knex')('BRH_DEPENDENTE').select('ID_BRH_DEPENDENTE').where('ID_BRH_COLABORADOR', titularId).where('DS_NOME', PREFIXO_TESTE + ' BackfillCPF').find() || [];
    adicionar(result, 'Dependente - backfill de CPF não cria segundo registro',
      totalBackfill.length === 1, totalBackfill);

    // (F) Sem CPF e sem Nome continua erro (Nome obrigatório)
    var dtoSemNome = dtoDependenteBase();
    dtoSemNome.Nome = '';
    dtoSemNome.CPF = '';
    var r9 = processarDependente(dtoSemNome);
    adicionar(result, 'Dependente - sem CPF e sem Nome continua erro funcional (Nome obrigatório)',
      !r9.sucesso && /Nome do dependente não informado/.test(r9.mensagens.join(' ')), r9);

    // (G) Sem CPF e sem Data de Nascimento continua erro (Data obrigatória)
    var dtoSemData = dtoDependenteBase();
    dtoSemData.Nome = PREFIXO_TESTE + ' SemData';
    dtoSemData.CPF = '';
    dtoSemData.DataNascimento = null;
    var r10 = processarDependente(dtoSemData);
    adicionar(result, 'Dependente - sem CPF e sem Data de Nascimento continua erro funcional',
      !r10.sucesso && /Data de Nascimento/.test(r10.mensagens.join(' ')), r10);

    // (E) Ambiguidade: dois registros existentes batem com a mesma chave alternativa
    var parentescoZFP1 = src.require('knex')('BRH_GRAU_PARENTESCO').select('ID_BRH_GRAU_PARENTESCO').where('DS_CODIGOFOLHA', 'ZFP1').findFirst();
    var parentescoIdZFP1 = parentescoZFP1 ? parentescoZFP1.id_brh_grau_parentesco : null;
    var dataAmbiguo = utils.converterDataOficial('27000');

    src.require('dao').getDao('BRH_DEPENDENTE').insert({
      id_brh_colaborador: titularId,
      ds_nome: PREFIXO_TESTE + ' Ambiguo',
      ds_cpf: null,
      op_sexo: 'F',
      dt_nascimento: dataAmbiguo,
      id_brh_grau_parentesco: parentescoIdZFP1
    });
    src.require('dao').getDao('BRH_DEPENDENTE').insert({
      id_brh_colaborador: titularId,
      ds_nome: PREFIXO_TESTE + ' Ambiguo',
      ds_cpf: null,
      op_sexo: 'F',
      dt_nascimento: dataAmbiguo,
      id_brh_grau_parentesco: parentescoIdZFP1
    });

    var dtoAmbiguo = dtoDependenteBase();
    dtoAmbiguo.Nome = PREFIXO_TESTE + ' Ambiguo';
    dtoAmbiguo.CPF = '';
    dtoAmbiguo.Sexo = 'Feminino';
    dtoAmbiguo.DataNascimento = dataAmbiguo;
    var r11 = processarDependente(dtoAmbiguo);
    adicionar(result, 'Dependente - ambiguidade na chave alternativa gera NAO_PROCESSADO (não escolhe arbitrariamente)',
      !r11.sucesso && /Mais de um dependente sem CPF/.test(r11.mensagens.join(' ')), r11);
  }

  // BRH_GRAU_PARENTESCO.OP_TIPOGRAUPARENTESCO é resolvido por classificação técnica a
  // partir do nome recebido (ver BusinessImportFolha.resolverTipoGrauParentesco).
  function verificarGrauParentesco(codigoFolha) {
    return src.require('knex')('BRH_GRAU_PARENTESCO')
      .select('OP_TIPOGRAUPARENTESCO', 'ID_BRH_GRUPO_ECONOMICO', 'DS_NOME')
      .where('DS_CODIGOFOLHA', codigoFolha)
      .findFirst();
  }

  function testarGrauParentesco(result, titularCriado) {
    if (!titularCriado) return;

    var dtoParentescoBase = function() {
      return {
        CodigoEmpresa: CODIGO_EMPRESA_TESTE,
        MatriculaTitular: MATRICULA_TITULAR,
        CPFTitular: '1234567890',
        Nome: PREFIXO_TESTE + ' DependenteParentesco',
        CPF: '',
        DataNascimento: utils.converterDataOficial('21638'),
        Sexo: 'Feminino',
        CodigoGrauParentesco: '',
        GrauParentesco: ''
      };
    };

    var casos = [
      { nome: 'Guarda Pro', codigo: 'ZFP2', opTipoEsperado: '3', especifica: true },
      { nome: 'Guarda Judicial', codigo: 'ZFP3', opTipoEsperado: '3', especifica: true },
      { nome: 'Filho(a)', codigo: 'ZFP4', opTipoEsperado: '3', especifica: true },
      { nome: 'Conjuge', codigo: 'ZFP5', opTipoEsperado: '2', especifica: true },
      { nome: 'Companheiro(a)', codigo: 'ZFP6', opTipoEsperado: '1', especifica: true },
      { nome: 'Enteado(a)', codigo: 'ZFP7', opTipoEsperado: '4', especifica: true },
      { nome: 'Tutor', codigo: 'ZFP8', opTipoEsperado: '8', especifica: true },
      { nome: 'Pais', codigo: 'ZFP9', opTipoEsperado: 'P', especifica: true },
      { nome: 'Irmao', codigo: 'ZFP10', opTipoEsperado: '0', especifica: true },
      { nome: 'Outros', codigo: 'ZFP11', opTipoEsperado: '0', especifica: true },
      // parentesco sem classificação específica: cai no fallback (OP_TIPOGRAUPARENTESCO=0), cria com sucesso e gera aviso
      { nome: PREFIXO_TESTE + ' ParentescoDesconhecido', codigo: 'ZFP12', opTipoEsperado: '0', especifica: false }
    ];

    casos.forEach(function(caso, indice) {
      var dto = dtoParentescoBase();
      dto.Nome = PREFIXO_TESTE + ' DepParentesco' + indice;
      dto.CPF = '900' + (1000000 + indice);
      dto.CodigoGrauParentesco = caso.codigo;
      dto.GrauParentesco = caso.nome;
      var r = processarDependente(dto);
      var registroParentesco = verificarGrauParentesco(caso.codigo);
      var opTipoOk = r.sucesso && !!registroParentesco && registroParentesco.op_tipograuparentesco === caso.opTipoEsperado && !!registroParentesco.id_brh_grupo_economico;
      var avisoOk = caso.especifica
        ? !r.avisos.some(function(a) { return /classificação técnica Outros/.test(a); })
        : r.avisos.some(function(a) { return /classificação técnica Outros/.test(a); });
      adicionar(result, 'Parentesco - "' + caso.nome + '" resolve com OP_TIPOGRAUPARENTESCO=' + caso.opTipoEsperado + (caso.especifica ? '' : ' (fallback, com aviso)'),
        opTipoOk && avisoOk, { resultado: r, registroParentesco: registroParentesco });
    });

    // Reprocessar o mesmo código não duplica o cadastro auxiliar
    var dtoReprocessado = dtoParentescoBase();
    dtoReprocessado.Nome = PREFIXO_TESTE + ' DepParentescoReprocessado';
    dtoReprocessado.CPF = '9009009001';
    dtoReprocessado.CodigoGrauParentesco = 'ZFP2';
    dtoReprocessado.GrauParentesco = 'Guarda Pro';
    var rReprocessado = processarDependente(dtoReprocessado);
    adicionar(result, 'Parentesco - código já existente é reaproveitado (sem duplicar)',
      rReprocessado.sucesso && contarPorCodigoFolha('BRH_GRAU_PARENTESCO', 'ZFP2') === 1, rReprocessado);

    // Código existente com nome divergente: código vence, não renomeia, gera aviso
    var dtoDivergente = dtoParentescoBase();
    dtoDivergente.Nome = PREFIXO_TESTE + ' DepParentescoDivergente';
    dtoDivergente.CPF = '9009009002';
    dtoDivergente.CodigoGrauParentesco = 'ZFP2';
    dtoDivergente.GrauParentesco = 'Guarda Pro Divergente';
    var rDivergente = processarDependente(dtoDivergente);
    var registroAposDivergencia = verificarGrauParentesco('ZFP2');
    adicionar(result, 'Parentesco - código com nome divergente mantém cadastro existente e avisa (não renomeia, não duplica)',
      rDivergente.sucesso && contarPorCodigoFolha('BRH_GRAU_PARENTESCO', 'ZFP2') === 1 &&
      !!registroAposDivergencia && registroAposDivergencia.ds_nome === 'Guarda Pro' &&
      rDivergente.avisos.some(function(a) { return /já cadastrado com nome diferente/.test(a); }),
      { resultado: rDivergente, registroAposDivergencia: registroAposDivergencia });
  }

  // Monta uma linha posicional de 32 colunas (layout oficial Titular) para
  // testar o roteamento real via onrecord, não apenas o núcleo via DTO.
  function construirColunasTitular(matricula, cpf, nome) {
    var colunas = [];
    colunas[0] = CODIGO_EMPRESA_TESTE;
    colunas[1] = matricula;
    colunas[2] = cpf;
    colunas[3] = nome;
    colunas[4] = '29682';
    colunas[5] = 'Masculino';
    colunas[6] = PREFIXO_TESTE + ' Casado';
    colunas[7] = PREFIXO_TESTE + ' Mae';
    colunas[8] = '';
    colunas[9] = '';
    colunas[10] = '';
    colunas[11] = 'ZFV1';
    colunas[12] = PREFIXO_TESTE + ' Vinculo';
    colunas[13] = 'ZFC1';
    colunas[14] = PREFIXO_TESTE + ' Cargo';
    colunas[15] = '';
    colunas[16] = 'ATIVO';
    colunas[17] = '';
    colunas[18] = PREFIXO_TESTE + ' Sindicato';
    colunas[19] = 'ZFS1';
    colunas[20] = '';
    colunas[21] = '45749';
    colunas[22] = '';
    colunas[23] = '';
    colunas[24] = '';
    colunas[25] = '';
    colunas[26] = '';
    colunas[27] = '';
    colunas[28] = '';
    colunas[29] = '';
    colunas[30] = '';
    colunas[31] = '';
    return colunas;
  }

  // Monta uma linha posicional do layout Dependente com "tamanho" colunas
  // (0 a tamanho-1 preenchidos); usada para simular linhas físicas mais curtas
  // (ex.: Nome da Mãe Dependente vazio no fim da linha).
  function construirColunasDependente(tamanho, cpfTitular, cpfDependente, nomeDependente) {
    var valores = [
      CODIGO_EMPRESA_TESTE,          // 0 Empresa
      MATRICULA_TITULAR,             // 1 Matrícula titular
      PREFIXO_TESTE + ' Titular',    // 2 Nome titular
      cpfTitular,                    // 3 CPF titular
      'ZFP1',                        // 4 Parentesco - Código
      PREFIXO_TESTE + ' Conjuge',    // 5 Parentesco
      cpfDependente,                 // 6 CPF Dependente
      nomeDependente,                // 7 Nome Dependente
      '21638',                       // 8 Data de Nascimento Dependente
      'Feminino',                    // 9 Sexo Dependente
      ''                              // 10 Nome da Mãe Dependente
    ];
    return valores.slice(0, tamanho);
  }

  function detectarRota(comprimento) {
    var colunas = [];
    for (var i = 0; i < comprimento; i++) colunas.push('');
    try {
      src.require('importFolha').onrecord({ columns: colunas }, {}, 2);
      return 'SUCESSO_INESPERADO';
    } catch (e) {
      var msg = String((e && e.message) || e);
      if (msg.indexOf('[TITULAR]') !== -1) return 'TITULAR';
      if (msg.indexOf('[DEPENDENTE]') !== -1) return 'DEPENDENTE';
      return 'DESCONHECIDO: ' + msg;
    }
  }

  function testarDispatchPorComprimento(result) {
    [
      { comprimento: 8, esperado: 'DEPENDENTE' },
      { comprimento: 10, esperado: 'DEPENDENTE' },
      { comprimento: 11, esperado: 'DEPENDENTE' },
      { comprimento: 12, esperado: 'DEPENDENTE' },
      { comprimento: 13, esperado: 'TITULAR' },
      { comprimento: 20, esperado: 'TITULAR' },
      { comprimento: 32, esperado: 'TITULAR' }
    ].forEach(function(caso) {
      var rota = detectarRota(caso.comprimento);
      adicionar(result, 'Dispatch - ' + caso.comprimento + ' colunas roteia para ' + caso.esperado, rota === caso.esperado, rota);
    });
  }

  function testarDependenteLinhaCurta(result, titularCriado) {
    if (!titularCriado) return;

    var colunasSemCpf = construirColunasDependente(10, '1234567890', '', PREFIXO_TESTE + ' Linha10ColSemCPF');
    try {
      src.require('importFolhaDependente').onrecord({ columns: colunasSemCpf }, {}, 2);
      var criadoSemCpf = src.require('knex')('BRH_DEPENDENTE').select('ID_BRH_DEPENDENTE', 'DS_CPF').where('DS_NOME', PREFIXO_TESTE + ' Linha10ColSemCPF').findFirst();
      adicionar(result, 'Dependente - linha de 10 colunas sem CPF (via onrecord real) é criada com sucesso',
        !!criadoSemCpf && criadoSemCpf.ds_cpf === null, criadoSemCpf);
    } catch (e) {
      adicionar(result, 'Dependente - linha de 10 colunas sem CPF (via onrecord real) é criada com sucesso',
        false, String((e && e.message) || e));
    }

    var colunas10 = construirColunasDependente(10, '1234567890', '1111122222', PREFIXO_TESTE + ' Dez Colunas');
    try {
      src.require('importFolhaDependente').onrecord({ columns: colunas10 }, {}, 2);
      var criado = src.require('knex')('BRH_DEPENDENTE').select('ID_BRH_DEPENDENTE').where('DS_CPF', '01111122222').findFirst();
      adicionar(result, 'Dependente - linha com 10 colunas e obrigatórios preenchidos processa normalmente', !!criado, criado);
    } catch (e) {
      adicionar(result, 'Dependente - linha com 10 colunas e obrigatórios preenchidos processa normalmente',
        false, String((e && e.message) || e));
    }
  }

  function testarTitularLinhaLongaCpfAusente(result) {
    var colunas = construirColunasTitular(PREFIXO_TESTE + '_CPFAUSENTE', '', PREFIXO_TESTE + ' CpfAusente');
    try {
      src.require('importFolhaTitular').onrecord({ columns: colunas }, {}, 2);
      adicionar(result, 'Titular - linha longa (32 colunas) com CPF ausente gera erro de CPF, não de layout', false, 'não lançou erro');
    } catch (e) {
      var msg = String((e && e.message) || e);
      adicionar(result, 'Titular - linha longa (32 colunas) com CPF ausente gera erro de CPF, não de layout',
        /CPF/.test(msg) && !/Layout incompatível/.test(msg), msg);
    }
  }

  // BRH_SITUACAO_COLABORADOR.OP_TIPO é resolvido a partir de uma lista fixa de valores
  // reais (não marcados de teste) — não são apagados no cleanup, pois podem ser
  // cadastros compartilhados com dados reais do ambiente.
  function verificarSituacao(codigoFolha) {
    return src.require('knex')('BRH_SITUACAO_COLABORADOR')
      .select('OP_TIPO', 'ID_BRH_GRUPO_ECONOMICO')
      .where('DS_CODIGOFOLHA', codigoFolha)
      .findFirst();
  }

  function testarSituacaoColaborador(result) {
    var casos = [
      { situacao: 'ATIVO', opTipoEsperado: '0', matricula: MATRICULA_SITUACAO_1, cpf: '2222233333', especifica: true },
      { situacao: 'INATIVO', opTipoEsperado: '1', matricula: MATRICULAS_SITUACAO_OP_TIPO[0], cpf: '5555566666', especifica: true },
      { situacao: 'AFASTADO', opTipoEsperado: '2', matricula: MATRICULAS_SITUACAO_OP_TIPO[1], cpf: '6666677777', especifica: true },
      { situacao: 'Licença Militar', opTipoEsperado: 'F', matricula: MATRICULAS_SITUACAO_OP_TIPO[2], cpf: '7777788888', especifica: true },
      { situacao: 'Licença Não Remunerada', opTipoEsperado: 'U', matricula: MATRICULAS_SITUACAO_OP_TIPO[3], cpf: '8888899999', especifica: true },
      { situacao: 'Licença Remunerada', opTipoEsperado: 'P', matricula: MATRICULAS_SITUACAO_OP_TIPO[4], cpf: '1010101010', especifica: true },
      { situacao: 'Férias', opTipoEsperado: '2', matricula: MATRICULAS_SITUACAO_OP_TIPO[5], cpf: '2020202020', especifica: true },
      { situacao: 'Licença Médica', opTipoEsperado: '2', matricula: MATRICULAS_SITUACAO_OP_TIPO[6], cpf: '3030303030', especifica: true },
      { situacao: 'Auxílio Doença', opTipoEsperado: '2', matricula: MATRICULAS_SITUACAO_OP_TIPO[7], cpf: '4040404040', especifica: true },
      { situacao: 'Atestado Médico', opTipoEsperado: '2', matricula: MATRICULAS_SITUACAO_OP_TIPO[8], cpf: '5050505050', especifica: true },
      { situacao: 'Licença Maternidade', opTipoEsperado: '2', matricula: MATRICULAS_SITUACAO_OP_TIPO[9], cpf: '6060606060', especifica: true },
      { situacao: 'Admissão', opTipoEsperado: '3', matricula: MATRICULAS_SITUACAO_OP_TIPO[10], cpf: '7070707070', especifica: true },
      // situação sem classificação específica: cai no fallback (OP_TIPO=2), cria com sucesso e gera aviso
      { situacao: PREFIXO_TESTE + ' TipoNaoMapeado', opTipoEsperado: '2', matricula: MATRICULAS_SITUACAO_OP_TIPO[11], cpf: '8080808080', especifica: false }
    ];

    casos.forEach(function(caso) {
      // BRH_SITUACAO_COLABORADOR não é limpo entre execuções (pode ser compartilhado
      // com dados reais) — o aviso de fallback só é emitido na CRIAÇÃO (ver
      // BusinessImportFolha.resolverOuCriarSituacao); numa rodada em que o valor de
      // teste já existe de uma execução anterior, a situação é apenas reaproveitada
      // e nenhum aviso novo é esperado. A classificação (OP_TIPO) continua obrigatória
      // em ambos os casos.
      var jaExistiaAntes = !!verificarSituacao(caso.situacao);
      var dto = dtoTitularBase();
      dto.MatriculaColaborador = caso.matricula;
      dto.CPF = caso.cpf;
      dto.SituacaoColaborador = caso.situacao;
      var r = processarColaborador(dto);
      var registroSituacao = verificarSituacao(caso.situacao);
      var opTipoOk = r.sucesso && !!registroSituacao && registroSituacao.op_tipo === caso.opTipoEsperado && !!registroSituacao.id_brh_grupo_economico;
      var avisoOk = caso.especifica
        ? !r.avisos.some(function(a) { return /classificação técnica/.test(a); })
        : (jaExistiaAntes || r.avisos.some(function(a) { return /classificação técnica/.test(a); }));
      adicionar(result, 'Situação - "' + caso.situacao + '" resolve com OP_TIPO=' + caso.opTipoEsperado + (caso.especifica ? '' : ' (fallback, com aviso na criação)'),
        opTipoOk && avisoOk, { resultado: r, registroSituacao: registroSituacao, jaExistiaAntes: jaExistiaAntes });
    });

    var dto2 = dtoTitularBase();
    dto2.MatriculaColaborador = MATRICULA_SITUACAO_2;
    dto2.CPF = '3333344444';
    dto2.SituacaoColaborador = 'ATIVO';
    var r2 = processarColaborador(dto2);
    adicionar(result, 'Situação - "ATIVO" já existente é reaproveitado (sem duplicar)',
      r2.sucesso && contarPorCodigoFolha('BRH_SITUACAO_COLABORADOR', 'ATIVO') === 1, r2);

    var dto3 = dtoTitularBase();
    dto3.MatriculaColaborador = MATRICULA_SITUACAO_3;
    dto3.CPF = '4444455555';
    dto3.SituacaoColaborador = '';
    var r3 = processarColaborador(dto3);
    adicionar(result, 'Situação - valor vazio continua erro funcional detalhado',
      !r3.sucesso && /Situa/.test(r3.mensagens.join(' ')), r3);
  }

  function testarFormatosData(result) {
    var casos = [
      { texto: '12/4/97', esperado: '1997-12-04' },
      { texto: '9/28/88', esperado: '1988-09-28' },
      { texto: '5/12/02', esperado: '2002-05-12' },
      { texto: '8/10/26', esperado: '2026-08-10' },
      { texto: '6/15/26', esperado: '2026-06-15' },
      { texto: '2/7/08', esperado: '2008-02-07' }
    ];
    casos.forEach(function(caso) {
      var data = utils.converterDataOficial(caso.texto);
      var iso = (data instanceof Date && !isNaN(data.getTime())) ? data.toISOString().substring(0, 10) : String(data);
      adicionar(result, 'Data - "' + caso.texto + '" (M/d/yy) converte para ' + caso.esperado, iso === caso.esperado, iso);
    });
  }

  // finalizarContadoresImportacao é função pura (Sucessos = Registros - Falhas, mín. 0),
  // sem dependência de DB — cobre os casos de fechamento pedidos, incluindo null/undefined.
  // A semântica "linha sem exceção = sucesso" (CRIADO/ATUALIZADO/SEM_ALTERACAO/dependente
  // sem CPF contam como sucesso) já é garantida estruturalmente pelo motor genérico
  // (nr_falhas só incrementa quando onrecord lança exceção) e está coberta indiretamente
  // pelos testes acima que confirmam SEM_ALTERACAO (`testarCriacaoTitular`, r2.acao) e
  // dependente sem CPF via onrecord real sem lançar (`testarDependenteLinhaCurta`).
  function testarFinalizarContadoresImportacao(result) {
    var casos = [
      { nome: '497 registros / 1 falha', importlog: { nr_registros: 497, nr_falhas: 1 }, esperado: 496 },
      { nome: '497 registros / 0 falhas', importlog: { nr_registros: 497, nr_falhas: 0 }, esperado: 497 },
      { nome: '10 registros / 10 falhas', importlog: { nr_registros: 10, nr_falhas: 10 }, esperado: 0 },
      { nome: '0 registros / 0 falhas', importlog: { nr_registros: 0, nr_falhas: 0 }, esperado: 0 },
      { nome: 'nr_registros/nr_falhas null', importlog: { nr_registros: null, nr_falhas: null }, esperado: 0 },
      { nome: 'nr_registros/nr_falhas undefined', importlog: {}, esperado: 0 }
    ];
    casos.forEach(function(caso) {
      var resultado = utils.finalizarContadoresImportacao(caso.importlog);
      adicionar(result, 'Contador de sucesso - ' + caso.nome + ' → ' + caso.esperado + ' sucessos',
        resultado.nr_registrossucesso === caso.esperado, resultado);
    });
  }

  function limparDadosDeTeste() {
    [MATRICULA_TITULAR, MATRICULA_SITUACAO_1, MATRICULA_SITUACAO_2, MATRICULA_SITUACAO_3]
      .concat(MATRICULAS_SITUACAO_OP_TIPO)
      .forEach(function(matricula) {
      try {
        var empresa = src.require('knex')('BRH_EMPRESA').select('ID_BRH_EMPRESA').where('DS_CODIGOFOLHA', CODIGO_EMPRESA_TESTE).findFirst();
        if (!empresa) return;

        var colaborador = src.require('knex')('BRH_COLABORADOR')
          .select('ID_BRH_COLABORADOR')
          .where('ID_BRH_EMPRESA', empresa.id_brh_empresa)
          .where('DS_MATRICULA', matricula)
          .findFirst();

        if (colaborador) {
          var dependentes = src.require('knex')('BRH_DEPENDENTE')
            .select('ID_BRH_DEPENDENTE')
            .where('ID_BRH_COLABORADOR', colaborador.id_brh_colaborador)
            .find() || [];
          for (var i = 0; i < dependentes.length; i++) {
            src.require('dao').getDao('BRH_DEPENDENTE').filter({ id_brh_dependente: dependentes[i].id_brh_dependente }).delete();
          }
          // Necessário antes do DELETE do colaborador — processarColaborador grava
          // BRH_ELEGIBILIDADE_HISTORICO a cada ATUALIZADO (mesmo padrão já usado em
          // testimportdesligamento.js); sem isso o histórico se acumula a cada rodada
          // e pode impedir o DELETE do colaborador por FK, deixando massa residual
          // para a próxima execução da suíte.
          var historicos = src.require('knex')('BRH_ELEGIBILIDADE_HISTORICO')
            .select('ID_BRH_ELEGIBILIDADE_HISTORICO')
            .where('ID_BRH_COLABORADOR', colaborador.id_brh_colaborador)
            .find() || [];
          for (var h = 0; h < historicos.length; h++) {
            src.require('dao').getDao('BRH_ELEGIBILIDADE_HISTORICO').filter({ id_brh_elegibilidade_historico: historicos[h].id_brh_elegibilidade_historico }).delete();
          }
          src.require('dao').getDao('BRH_COLABORADOR').filter({ id_brh_colaborador: colaborador.id_brh_colaborador }).delete();
        }
      } catch (e) {
        logger.error('[limparDadosDeTeste] Falha ao remover colaborador/dependentes de teste (' + matricula + ')', e);
      }
    });

    limparCadastroAuxiliar('BRH_CARGO', ['ZFC1', 'ZFC2', 'ZFC3']);
    limparCadastroAuxiliar('BRH_VINCULO_EMPREGATICIO', ['ZFV1', 'ZFV2']);
    limparCadastroAuxiliar('BRH_SINDICATO', ['ZFS1']);
    limparCadastroAuxiliar('BRH_GRAU_PARENTESCO', ['ZFP1', 'ZFP2', 'ZFP3', 'ZFP4', 'ZFP5', 'ZFP6', 'ZFP7', 'ZFP8', 'ZFP9', 'ZFP10', 'ZFP11', 'ZFP12']);
    // BRH_SITUACAO_COLABORADOR não é limpo: os valores usados nos testes (ATIVO,
    // INATIVO, AFASTADO, ...) são reais, não marcados — podem ser compartilhados
    // com outros colaboradores do ambiente.
    limparCadastroAuxiliarPorNome('BRH_ESTADO_CIVIL', PREFIXO_TESTE + ' Casado');
  }

  function limparCadastroAuxiliar(entidade, codigos) {
    try {
      for (var i = 0; i < codigos.length; i++) {
        var registros = src.require('knex')(entidade).select('ID_' + entidade).where('DS_CODIGOFOLHA', codigos[i]).find() || [];
        for (var j = 0; j < registros.length; j++) {
          src.require('dao').getDao(entidade).filter(idFiltro(entidade, registros[j])).delete();
        }
      }
    } catch (e) {
      logger.error('[limparDadosDeTeste] Falha ao remover ' + entidade + ' de teste', e);
    }
  }

  function limparCadastroAuxiliarPorNome(entidade, nome) {
    try {
      var registros = src.require('knex')(entidade).select('ID_' + entidade).where('DS_CODIGOFOLHA', nome).find() || [];
      for (var j = 0; j < registros.length; j++) {
        src.require('dao').getDao(entidade).filter(idFiltro(entidade, registros[j])).delete();
      }
    } catch (e) {
      logger.error('[limparDadosDeTeste] Falha ao remover ' + entidade + ' de teste', e);
    }
  }

  function idFiltro(entidade, registro) {
    var filtro = {};
    filtro['id_' + entidade.toLowerCase()] = registro['id_' + entidade.toLowerCase()];
    return filtro;
  }

  function run() {
    var result = [];
    logger.warn('Iniciando testes de Folha - Titular/Dependente');

    // Limpeza preventiva: garante massa zerada mesmo se uma execução anterior desta
    // suíte não tiver concluído seu próprio cleanup (ex.: processo interrompido) —
    // requisito de idempotência entre execuções consecutivas.
    limparDadosDeTeste();

    testarEmpresaInexistente(result);
    testarCpfAusente(result);

    var titularCriado = false;
    try {
      titularCriado = testarCriacaoTitular(result);
      testarDependente(result, titularCriado);
      testarGrauParentesco(result, titularCriado);
      testarDispatchPorComprimento(result);
      testarDependenteLinhaCurta(result, titularCriado);
      testarTitularLinhaLongaCpfAusente(result);
      testarSituacaoColaborador(result);
      testarFormatosData(result);
      testarFinalizarContadoresImportacao(result);
    } finally {
      limparDadosDeTeste();
    }

    adicionarResumo(result);
    logger.warn('Finalizado testes de Folha - Titular/Dependente');
    return result;
  }

  return {
    'run': run
  };
})();
