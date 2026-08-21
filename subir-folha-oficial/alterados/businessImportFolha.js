/*
 * BusinessImportFolha
 * durr.main.dev.integracao.businessImportFolha
 *
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.integracao.businessImportFolha');

  var src = require('plusoftcrm.libs.main.source')({
    'credentials': 'inpaas.core.user.credentials',
    'utilsImportFolha': 'durr.main.dev.integracao.utilsimportfolha'
  });

  var utils = src.require('utilsImportFolha');

  var CAMPOS_OBRIGATORIOS_TITULAR = [
    { chave: 'CodigoEmpresaBrhain', msg: 'Empresa não encontrada' },
    { chave: 'CodigoVinculoEmpregaticioBrhain', msg: 'Vínculo não encontrado' },
    { chave: 'CodigoCargoBrhain', msg: 'Função/Cargo não encontrado' },
    { chave: 'CodigoSituacaoColaboradorBrhain', msg: 'Situação não encontrada' },
    { chave: 'Sexo', msg: 'Sexo não encontrado' },
    { chave: 'MatriculaColaborador', msg: 'Matrícula não encontrada' },
    { chave: 'NomeCompletoColaborador', msg: 'Nome não encontrado' },
    { chave: 'DataNascimento', msg: 'Data de Nascimento não encontrada' },
    { chave: 'DataAdmissao', msg: 'Data de Admissão não encontrada' },
    { chave: 'NomeMae', msg: 'Nome da Mãe não encontrado' },
    { chave: 'CPF', msg: 'CPF não encontrado' }
  ];

  // CPF Dependente é opcional (BRH_DEPENDENTE.DS_CPF é nullable, confirmado no schema real).
  var CAMPOS_OBRIGATORIOS_DEPENDENTE = [
    { chave: 'Nome', msg: 'Nome não encontrado' },
    { chave: 'CodigoGrauParentescoBrhain', msg: 'Grau de Parentesco não encontrado' },
    { chave: 'DataNascimento', msg: 'Data de Nascimento não encontrada' },
    { chave: 'Sexo', msg: 'Sexo não encontrado' }
  ];

  // No DURR sempre há um único grupo econômico (seção 8 da especificação).
  var idGrupoEconomicoCache = null;

  function obterIdGrupoEconomico() {
    if (idGrupoEconomicoCache) return idGrupoEconomicoCache;
    var grupo = src.require('knex')('BRH_GRUPO_ECONOMICO').select('ID_BRH_GRUPO_ECONOMICO').findFirst();
    if (!grupo) return null;
    idGrupoEconomicoCache = grupo.id_brh_grupo_economico;
    return idGrupoEconomicoCache;
  }

  // BRH_SITUACAO_COLABORADOR.OP_TIPO é Lista de Opções (confirmado na entidade real de
  // um cliente produtivo) — particularidade só dessa entidade, não generalizada para
  // outros cadastros auxiliares (Cargo/Vínculo/Sindicato não têm esse campo).
  // OP_TIPO é uma classificação TÉCNICA, não o nome da situação — vários nomes de
  // situação de afastamento (Férias, Licença Médica, Auxílio Doença, Atestado Médico,
  // Licença Maternidade, Afastado) compartilham legitimamente OP_TIPO=2, confirmado
  // pela evidência real (Férias e Licença Médica ambos = 2 no cliente produtivo).
  var OP_TIPO_SITUACAO = {
    'ATIVO': '0',
    'INATIVO': '1',
    'LICENCA MILITAR': 'F',
    'REJEITADO': 'O',
    'LICENCA REMUNERADA': 'P',
    'APOSENTADO': 'R',
    'SUSPENSO': 'S',
    'DEMITIDO': 'T',
    'LICENCA NAO REMUNERADA': 'U',
    'NAO COMPARECEU': 'X',
    'ADMISSAO': '3',
    'AFASTADO': '2',
    'FERIAS': '2',
    'LICENCA MEDICA': '2',
    'AUXILIO DOENCA': '2',
    'ATESTADO MEDICO': '2',
    'LICENCA MATERNIDADE': '2'
  };

  // Fallback para qualquer situação textual sem classificação específica na tabela
  // acima: OP_TIPO=2 (mesma classificação técnica de afastamento), gera aviso, nunca
  // bloqueia o colaborador. Só situação vazia continua erro funcional.
  var OP_TIPO_FALLBACK = '2';

  // Normalização compartilhada entre Situação do Colaborador e Grau de Parentesco
  // (ambos resolvem uma classificação técnica a partir do texto recebido na folha).
  function normalizarChaveClassificacaoTecnica(valor) {
    return utils.textoLimpo(valor).toUpperCase()
      .replace(/[ÁÀÂÃ]/g, 'A')
      .replace(/[ÉÊ]/g, 'E')
      .replace(/[ÍÎ]/g, 'I')
      .replace(/[ÓÔÕ]/g, 'O')
      .replace(/[ÚÛ]/g, 'U')
      .replace(/Ç/g, 'C');
  }

  function situacaoTemClassificacaoEspecifica(valor) {
    return Object.prototype.hasOwnProperty.call(OP_TIPO_SITUACAO, normalizarChaveClassificacaoTecnica(valor));
  }

  function resolverTipoSituacao(valor) {
    var chave = normalizarChaveClassificacaoTecnica(valor);
    return Object.prototype.hasOwnProperty.call(OP_TIPO_SITUACAO, chave) ? OP_TIPO_SITUACAO[chave] : OP_TIPO_FALLBACK;
  }

  // BRH_SITUACAO_COLABORADOR não tem OP_ATIVO (confirmado na entidade real) — só
  // ID_BRH_GRUPO_ECONOMICO, DS_NOME, DS_CODIGOFOLHA, OP_TIPO são enviados.
  function criarSituacaoColaborador(codigoFolha, opTipo, idGrupoEconomico) {
    var novoRegistro = {
      id_brh_grupo_economico: idGrupoEconomico,
      ds_nome: codigoFolha,
      ds_codigofolha: codigoFolha,
      op_tipo: opTipo
    };
    try {
      src.require('dao').getDao('BRH_SITUACAO_COLABORADOR').insert(novoRegistro);
    } catch (e) {
      logger.error('Erro ao criar Situação do Colaborador', e);
      throw new Error(
        'Não foi possível criar Situação do Colaborador. Situação: ' + codigoFolha +
        ' | Código folha: ' + codigoFolha + ' | OP_TIPO: ' + opTipo +
        ' | Erro: ' + (e.message || e.toString())
      );
    }
    return novoRegistro.id_brh_situacao_colaborador;
  }

  // Resolve/cria BRH_SITUACAO_COLABORADOR por DS_CODIGOFOLHA — extraída de
  // processarColaborador para reuso pelo fluxo de Desligamento (Situação "Demitido"),
  // sem duplicar a lógica de classificação técnica/fallback.
  function resolverOuCriarSituacao(codigoSituacao, idGrupoEconomico, resultado) {
    if (!utils.campoPreenchido(codigoSituacao)) return null;
    var situacaoExistente = utils.buscarUm('BRH_SITUACAO_COLABORADOR', { ds_codigofolha: codigoSituacao });
    if (situacaoExistente) {
      return situacaoExistente.id_brh_situacao_colaborador;
    }
    var opTipo = resolverTipoSituacao(codigoSituacao);
    var idSituacao = criarSituacaoColaborador(codigoSituacao, opTipo, idGrupoEconomico);
    if (!situacaoTemClassificacaoEspecifica(codigoSituacao)) {
      resultado.avisos.push('Situação nova da folha criada com classificação técnica Afastado. Situação: ' + codigoSituacao + ' | OP_TIPO: ' + opTipo + '.');
    }
    return idSituacao;
  }

  // BRH_GRAU_PARENTESCO.OP_TIPOGRAUPARENTESCO é Lista de Opções (confirmado em DEV:
  // error.entity.attribute.notnull ao criar parentesco sem esse campo) — mesma
  // particularidade de Situação do Colaborador, também não generalizada para o
  // helper genérico de Cargo/Vínculo/Sindicato. Classificação técnica confirmada
  // com evidência de cliente produtivo.
  var OP_TIPOGRAUPARENTESCO = {
    'TITULAR': '6',
    'FILHO': '3',
    'FILHA': '3',
    'FILHO(A)': '3',
    'GUARDA JUDICIAL': '3',
    'GUARDA PRO': '3',
    'GUARDA PROVISORIA': '3',
    'CONJUGE': '2',
    'COMPANHEIRO': '1',
    'COMPANHEIRA': '1',
    'COMPANHEIRO(A)': '1',
    'ENTEADO': '4',
    'ENTEADA': '4',
    'ENTEADO(A)': '4',
    'TUTOR': '8',
    'TUTORA': '8',
    'PAI': 'P',
    'MAE': 'P',
    'PAIS': 'P',
    'EX-CONJUGE': '0',
    'IRMAO': '0',
    'IRMA': '0',
    'OUTROS': '0'
  };

  // Fallback para parentesco sem classificação específica: '0' ("Outros"), gera
  // aviso, nunca bloqueia o dependente. DS_NOME grava o nome real recebido, nunca
  // é substituído por "Outros".
  var OP_TIPOGRAUPARENTESCO_FALLBACK = '0';

  function parentescoTemClassificacaoEspecifica(valor) {
    return Object.prototype.hasOwnProperty.call(OP_TIPOGRAUPARENTESCO, normalizarChaveClassificacaoTecnica(valor));
  }

  function resolverTipoGrauParentesco(valor) {
    var chave = normalizarChaveClassificacaoTecnica(valor);
    return Object.prototype.hasOwnProperty.call(OP_TIPOGRAUPARENTESCO, chave) ? OP_TIPOGRAUPARENTESCO[chave] : OP_TIPOGRAUPARENTESCO_FALLBACK;
  }

  function criarGrauParentesco(codigoFolha, nome, opTipo, idGrupoEconomico) {
    var novoRegistro = {
      id_brh_grupo_economico: idGrupoEconomico,
      ds_codigofolha: codigoFolha,
      ds_nome: utils.campoPreenchido(nome) ? nome : codigoFolha,
      op_tipograuparentesco: opTipo
    };
    try {
      src.require('dao').getDao('BRH_GRAU_PARENTESCO').insert(novoRegistro);
    } catch (e) {
      logger.error('Erro ao criar Grau de Parentesco', e);
      throw new Error(
        'Não foi possível criar Grau de Parentesco. Código folha: ' + codigoFolha +
        ' | Parentesco: ' + nome + ' | OP_TIPOGRAUPARENTESCO: ' + opTipo +
        ' | Erro: ' + (e.message || e.toString())
      );
    }
    return novoRegistro.id_brh_grau_parentesco;
  }

  function processarColaborador(colaborador) {
    var resultado = { sucesso: true, acao: null, idColaborador: null, mensagens: [], avisos: [] };
    colaborador = colaborador || {};

    try {
      var idGrupoEconomico = obterIdGrupoEconomico();
      if (!idGrupoEconomico) {
        resultado.sucesso = false;
        resultado.mensagens.push('Grupo econômico padrão não configurado.');
        return resultado;
      }

      var codigoSituacao = utils.textoLimpo(colaborador.SituacaoColaborador);
      var idSituacao = resolverOuCriarSituacao(codigoSituacao, idGrupoEconomico, resultado);

      var mapeado = montarColaboradorMapeado(colaborador, idGrupoEconomico, idSituacao);
      var pendencias = utils.validarCamposObrigatorios(mapeado, CAMPOS_OBRIGATORIOS_TITULAR);
      if (pendencias.length) {
        resultado.sucesso = false;
        resultado.mensagens.push('Colaborador com dados inválidos: ' + pendencias.join(', '));
        return resultado;
      }

      var statusColaborador = obterStatusColaborador(mapeado.CodigoSituacaoColaboradorBrhain);
      if (!statusColaborador) {
        resultado.sucesso = false;
        resultado.mensagens.push('Situação do colaborador não encontrada, dados não processados.');
        return resultado;
      }

      var colaboradorInserido;
      var colaboradorExistente = utils.buscarUm('BRH_COLABORADOR', {
        ds_cpf: mapeado.CPF,
        ds_matricula: mapeado.MatriculaColaborador
      });
      if (colaboradorExistente) {
        var resultadoAtualizacao = atualizarColaborador(mapeado, colaboradorExistente);
        colaboradorInserido = resultadoAtualizacao.colaborador;

        if (resultadoAtualizacao.atualizado) {
          resultado.acao = 'atualizado';
          resultado.mensagens.push('Colaborador atualizado.');
          registrarHistoricoElegibilidade(colaboradorInserido.id_brh_colaborador, 'Alteração', null);
        } else {
          resultado.acao = 'semAlteracao';
          resultado.mensagens.push('Colaborador já sincronizado.');
        }
      } else {
        colaboradorInserido = criarColaborador(mapeado);
        if (colaboradorInserido) {
          resultado.acao = 'criado';
          resultado.mensagens.push('Colaborador criado.');
          registrarHistoricoElegibilidade(colaboradorInserido.id_brh_colaborador, 'Admissão', colaborador.DataAdmissao);
        }
      }

      if (!colaboradorInserido) {
        resultado.sucesso = false;
        resultado.mensagens.push('Não foi possível criar/atualizar o colaborador.');
        return resultado;
      }

      resultado.idColaborador = colaboradorInserido.id_brh_colaborador;
      processarDependentes(colaborador.Dependentes, colaboradorInserido, idGrupoEconomico, resultado);
    } catch (e) {
      logger.error('Erro ao processar colaborador', e);
      resultado.sucesso = false;
      resultado.mensagens.push('Erro ao processar colaborador: ' + (e.message || e.toString()));
    }
    return resultado;
  }

  function importarTitularesDependentes(payload) {
    var relatorio = utils.criarRelatorioImportacao();
    try {
      var linhas = payload && payload['colaboradores'];
      if (!linhas || typeof linhas.forEach !== 'function') {
        utils.registrarErro(relatorio, 'payload', 'Nenhum registro recebido para importação (chave "colaboradores" ausente ou não é uma lista).');
        return relatorio;
      }

      linhas.forEach(function(linha) {
        relatorio.totalRecebidos++;
        var matricula = utils.textoLimpo(linha[COLUNAS.MATRICULA]);
        var colaboradorDto = mapearLinhaPlanilhaParaColaborador(linha);
        var resultado = processarColaborador(colaboradorDto);

        if (resultado.sucesso) {
          utils.registrarSucesso(relatorio, matricula, 'Colaborador processado.', { id_brh_colaborador: resultado.idColaborador });
        } else {
          utils.registrarErro(relatorio, matricula, resultado.mensagens.join(' | '));
        }
        resultado.avisos.forEach(function(aviso) {
          utils.registrarAviso(relatorio, matricula, aviso);
        });
      });

      if (relatorio.totalRecebidos === 0) {
        utils.registrarErro(relatorio, 'payload', 'A lista de colaboradores recebida está vazia.');
      }
    } catch (e) {
      logger.error('Erro inesperado ao importar titulares/dependentes', e);
      utils.registrarErro(relatorio, 'payload', 'Erro inesperado na importação: ' + (e.message || e.toString()));
    }
    return relatorio;
  }

  // Mapeamento do lote REST legado (payload JSON por nome de coluna), independente
  // do layout oficial de Excel (mapeamento posicional em ImportFolha).
  var COLUNAS = {
    EMPRESA_CODIGO: 'Empresa - Código',
    MATRICULA: 'Matrícula',
    CPF_TITULAR: 'CPF Titular',
    NOME_TITULAR: 'Nome Titular',
    DATA_NASCIMENTO_TITULAR: 'Data de Nascimento Titular',
    SEXO_TITULAR: 'Sexo Titular',
    ESTADO_CIVIL: 'Estado Civil - Nome',
    NOME_MAE_TITULAR: 'Nome da Mãe Titular',
    NOME_PAI_TITULAR: 'Nome do Pai Titular',
    VINCULO_CODIGO: 'Vínculo Empregatício - Código',
    VINCULO_NOME: 'Vínculo Empregatício - Nome',
    FUNCAO_CODIGO: 'Função - Código',
    FUNCAO_NOME: 'Função - Nome',
    IDENTIDADE_TITULAR: 'Identidade Titular',
    SITUACAO_EMPREGADO: 'Situação do Empregado',
    SINDICATO_CODIGO: 'Sindicato - Código',
    SINDICATO_NOME: 'Sindicato - Razão Social',
    DATA_ADMISSAO: 'Data da Admissão',
    EMAIL: 'E-Mail',
    CEP: 'Endereço - CEP',
    LOGRADOURO: 'Endereço - Logradouro',
    NUMERO: 'Endereço - Número',
    COMPLEMENTO: 'Endereço - Complemento',
    BAIRRO: 'Endereço - Bairro',
    MUNICIPIO_NOME: 'Endereço - Município Nome',
    UF: 'Endereço - UF',
    BANCO_CODIGO: 'Banco - Código BACEN',
    BANCO_NOME: 'Banco - Nome',
    PARENTESCO_CODIGO: 'Parentesco - Código',
    PARENTESCO_NOME: 'Parentesco',
    CPF_DEPENDENTE: 'CPF Dependente',
    NOME_DEPENDENTE: 'Nome Dependente',
    DATA_NASCIMENTO_DEPENDENTE: 'Data de Nascimento Dependente',
    SEXO_DEPENDENTE: 'Sexo Dependente'
  };

  function mapearLinhaPlanilhaParaColaborador(linha) {
    var temDependente = utils.campoPreenchido(linha[COLUNAS.CPF_DEPENDENTE]) && utils.campoPreenchido(linha[COLUNAS.NOME_DEPENDENTE]);
    return {
      CodigoEmpresa: linha[COLUNAS.EMPRESA_CODIGO],
      MatriculaColaborador: linha[COLUNAS.MATRICULA],
      CPF: linha[COLUNAS.CPF_TITULAR],
      NomeCompletoColaborador: linha[COLUNAS.NOME_TITULAR],
      NomeSocialColaborador: linha[COLUNAS.NOME_TITULAR],
      DataNascimento: linha[COLUNAS.DATA_NASCIMENTO_TITULAR],
      Sexo: linha[COLUNAS.SEXO_TITULAR],
      EstadoCivil: linha[COLUNAS.ESTADO_CIVIL],
      NomeMae: linha[COLUNAS.NOME_MAE_TITULAR],
      NomePai: linha[COLUNAS.NOME_PAI_TITULAR],
      CodigoVinculoEmpregaticio: linha[COLUNAS.VINCULO_CODIGO],
      VinculoNome: linha[COLUNAS.VINCULO_NOME],
      CodigoCargo: linha[COLUNAS.FUNCAO_CODIGO],
      Cargo: linha[COLUNAS.FUNCAO_NOME],
      RG: linha[COLUNAS.IDENTIDADE_TITULAR],
      SituacaoColaborador: linha[COLUNAS.SITUACAO_EMPREGADO],
      CodigoSindicato: linha[COLUNAS.SINDICATO_CODIGO],
      Sindicato: linha[COLUNAS.SINDICATO_NOME],
      DataAdmissao: linha[COLUNAS.DATA_ADMISSAO],
      EmailCorporativo: linha[COLUNAS.EMAIL],
      CEPPessoal: linha[COLUNAS.CEP],
      LogradouroPessoal: linha[COLUNAS.LOGRADOURO],
      NumeroPessoal: linha[COLUNAS.NUMERO],
      ComplementoPessoal: linha[COLUNAS.COMPLEMENTO],
      BairroPessoal: linha[COLUNAS.BAIRRO],
      CidadePessoal: linha[COLUNAS.MUNICIPIO_NOME],
      UFPessoal: linha[COLUNAS.UF],
      Banco: linha[COLUNAS.BANCO_CODIGO],
      NomeBanco: linha[COLUNAS.BANCO_NOME],
      Dependentes: temDependente ? [{
        Nome: linha[COLUNAS.NOME_DEPENDENTE],
        CPF: linha[COLUNAS.CPF_DEPENDENTE],
        DataNascimento: linha[COLUNAS.DATA_NASCIMENTO_DEPENDENTE],
        Sexo: linha[COLUNAS.SEXO_DEPENDENTE],
        CodigoGrauParentesco: linha[COLUNAS.PARENTESCO_CODIGO],
        GrauParentesco: linha[COLUNAS.PARENTESCO_NOME]
      }] : []
    };
  }

  function montarColaboradorMapeado(colaborador, idGrupoEconomico, idSituacao) {
    return {
      CodigoGrupoEconomicoBrhain: idGrupoEconomico,
      CodigoEmpresaBrhain: utils.mapeamentoCodigoFolha('BRH_EMPRESA', colaborador.CodigoEmpresa, 'ID_BRH_EMPRESA'),
      CodigoVinculoEmpregaticioBrhain: utils.mapeamentoCodigoFolhaOuCriar('BRH_VINCULO_EMPREGATICIO', colaborador.CodigoVinculoEmpregaticio, colaborador.VinculoNome, 'ID_BRH_VINCULO_EMPREGATICIO', idGrupoEconomico),
      CodigoSindicatoBrhain: utils.mapeamentoCodigoFolhaOuCriar('BRH_SINDICATO', colaborador.CodigoSindicato, colaborador.Sindicato, 'ID_BRH_SINDICATO', idGrupoEconomico),
      CodigoCargoBrhain: utils.mapeamentoCodigoFolhaOuCriar('BRH_CARGO', colaborador.CodigoCargo, colaborador.Cargo, 'ID_BRH_CARGO', idGrupoEconomico),
      // Situação sem Data já foi resolvida/criada em processarColaborador (precisa de
      // OP_TIPO, particularidade só dessa entidade — não usa o helper genérico).
      CodigoSituacaoColaboradorBrhain: idSituacao || '',
      // BRH_ESTADO_CIVIL usa o valor por extenso ("Casado", "Solteiro", ...) como DS_CODIGOFOLHA.
      CodigoEstadoCivilBrhain: utils.mapeamentoCodigoFolhaOuCriar('BRH_ESTADO_CIVIL', colaborador.EstadoCivil, colaborador.EstadoCivil, 'ID_BRH_ESTADO_CIVIL', idGrupoEconomico),

      Sexo: colaborador.Sexo,
      MatriculaColaborador: utils.textoLimpo(colaborador.MatriculaColaborador),
      NomeCompletoColaborador: utils.textoLimpo(colaborador.NomeCompletoColaborador),
      NomeSocialColaborador: utils.campoPreenchido(colaborador.NomeSocialColaborador) ? utils.textoLimpo(colaborador.NomeSocialColaborador) : utils.textoLimpo(colaborador.NomeCompletoColaborador),
      DataNascimento: utils.validaData(colaborador.DataNascimento),
      DataAdmissao: utils.validaData(colaborador.DataAdmissao),
      NomeMae: utils.textoLimpo(colaborador.NomeMae),
      NomePai: utils.textoLimpo(colaborador.NomePai),
      CPF: utils.formatarCpf(colaborador.CPF),
      RG: utils.textoLimpo(colaborador.RG),

      Email: utils.textoLimpo(colaborador.EmailCorporativo),
      CEP: utils.normalizarCep(colaborador.CEPPessoal),
      Logradouro: utils.textoLimpo(colaborador.LogradouroPessoal),
      Numero: utils.textoLimpo(colaborador.NumeroPessoal),
      Complemento: utils.textoLimpo(colaborador.ComplementoPessoal),
      Bairro: utils.textoLimpo(colaborador.BairroPessoal),

      NumeroBanco: utils.textoLimpo(colaborador.Banco),
      NomeBanco: utils.textoLimpo(colaborador.NomeBanco)
    };
  }

  function obterStatusColaborador(idSituacao) {
    if (!idSituacao) return null;
    var situacao = src.require('knex')('BRH_SITUACAO_COLABORADOR')
    .select('OP_TIPO')
    .where('ID_BRH_SITUACAO_COLABORADOR', idSituacao)
    .findFirst();
    if (!situacao) return null;
    return {
      inativo: situacao.op_tipo === 'T' || situacao.op_tipo === '1'
    };
  }

  // somenteInformados=true monta um payload seletivo (usado em UPDATE), omitindo
  // por completo as chaves cujo dado de origem não veio preenchido nesta carga —
  // para não apagar cadastro existente com um campo ausente no arquivo oficial.
  function montarPayloadColaborador(colaborador, somenteInformados) {
    var dados = {};

    function set(chave, valor, origemPreenchida) {
      if (somenteInformados && !origemPreenchida) return;
      dados[chave] = valor;
    }

    set('id_brh_grupo_economico', colaborador.CodigoGrupoEconomicoBrhain, true);
    set('id_brh_empresa', colaborador.CodigoEmpresaBrhain, true);
    set('id_brh_vinculo_empregaticio', colaborador.CodigoVinculoEmpregaticioBrhain, true);
    set('id_brh_sindicato', colaborador.CodigoSindicatoBrhain || null, utils.campoPreenchido(colaborador.CodigoSindicato));
    set('id_brh_cargo', colaborador.CodigoCargoBrhain, true);
    set('id_brh_situacao_colaborador', colaborador.CodigoSituacaoColaboradorBrhain, true);
    set('id_brh_estado_civil', colaborador.CodigoEstadoCivilBrhain || null, utils.campoPreenchido(colaborador.CodigoEstadoCivilBrhain));
    set('op_sexo', utils.mapeamentoSexo(colaborador.Sexo), utils.campoPreenchido(colaborador.Sexo));
    set('ds_matricula', colaborador.MatriculaColaborador, true);
    set('ds_nome', colaborador.NomeCompletoColaborador, true);
    set('ds_nomesocial', colaborador.NomeSocialColaborador, true);
    set('dt_nascimento', colaborador.DataNascimento, true);
    set('dt_admissao', colaborador.DataAdmissao, true);
    set('ds_nomemae', colaborador.NomeMae, true);
    set('ds_nomepai', colaborador.NomePai || null, utils.campoPreenchido(colaborador.NomePai));
    set('ds_cpf', colaborador.CPF, true);
    set('ds_rg', colaborador.RG || null, utils.campoPreenchido(colaborador.RG));
    set('ds_emailcorporativo', colaborador.Email || null, utils.campoPreenchido(colaborador.Email));
    set('ds_cep', colaborador.CEP || null, utils.campoPreenchido(colaborador.CEP));
    set('ds_logradouro', colaborador.Logradouro || null, utils.campoPreenchido(colaborador.Logradouro));
    set('ds_logradouronumero', colaborador.Numero || null, utils.campoPreenchido(colaborador.Numero));
    set('ds_complemento', colaborador.Complemento || null, utils.campoPreenchido(colaborador.Complemento));
    set('ds_bairro', colaborador.Bairro || null, utils.campoPreenchido(colaborador.Bairro));
    set('ds_numerobanco', colaborador.NumeroBanco || null, utils.campoPreenchido(colaborador.NumeroBanco));
    set('ds_nomebanco', colaborador.NomeBanco || null, utils.campoPreenchido(colaborador.NomeBanco));
    return dados;
  }

  function criarColaborador(colaborador) {
    var usuario = criarOuReativarUsuario(colaborador);
    colaborador['id_core_user'] = usuario ? usuario['id_users'] : null;

    var dados = montarPayloadColaborador(colaborador, false);
    dados.id_core_user = colaborador['id_core_user'];
    src.require('dao').getDao('BRH_COLABORADOR').insert(dados);
    return dados;
  }

  function atualizarColaborador(colaborador, colaboradorAtual) {
    var dadosSeletivos = montarPayloadColaborador(colaborador, true);

    if (!possuiAlteracaoElegibilidade(dadosSeletivos, colaboradorAtual)) {
      return {
        colaborador: colaboradorAtual,
        atualizado: false
      };
    }

    var usuario = criarOuReativarUsuario(colaborador);
    colaborador['id_core_user'] = usuario ? usuario['id_users'] : colaboradorAtual['id_core_user'];

    var dados = dadosSeletivos;
    dados.id_core_user = colaborador['id_core_user'];
    dados.id_brh_colaborador = colaboradorAtual['id_brh_colaborador'];
    src.require('dao').getDao('BRH_COLABORADOR')
      .filter({ id_brh_colaborador: colaboradorAtual['id_brh_colaborador'] })
      .update(dados);
    return {
      colaborador: dados,
      atualizado: true
    };
  }

  var CAMPOS_ELEGIBILIDADE = [
    'id_brh_empresa',
    'id_brh_filial',
    'id_brh_grade',
    'id_brh_cargo',
    'id_brh_departamento',
    'id_brh_sindicato'
  ];

  function possuiAlteracaoElegibilidade(novosDados, dadosAtuais) {
    return CAMPOS_ELEGIBILIDADE.some(function(campo) {
      if (!Object.prototype.hasOwnProperty.call(novosDados, campo)) return false;
      return normalizarValorComparacao(novosDados[campo]) !== normalizarValorComparacao(dadosAtuais[campo]);
    });
  }

  // Confirmado em DEV (sonda temporária): BRH_DEPENDENTE.DT_NASCIMENTO retorna do
  // Knex como um objeto Java nativo — typeof 'object', mas NÃO instanceof Date (ex.:
  // "1959-03-29 00:00:00", isDate=false) — diferente de um Date JS recém-computado
  // (instanceof Date=true). A versão anterior só truncava para "AAAA-MM-DD" quando o
  // valor era instanceof Date OU typeof 'string' explicitamente; o objeto Java caía no
  // fallback genérico String(valor), preservando o horário completo e nunca batendo
  // com o lado já truncado — fazendo toda comparação de data de Dependente falhar
  // sempre (mesmo com o mesmo dia), tanto em possuiAlteracaoDependente quanto em
  // localizarDependentesPorChaveAlternativa. Corrigido para extrair "AAAA-MM-DD" via
  // regex sobre a representação em texto de QUALQUER valor não-Date, não só string.
  function normalizarValorComparacao(valor) {
    if (valor === null || typeof valor === 'undefined' || valor === '') return '';

    if (valor instanceof Date) {
      return isNaN(valor.getTime()) ? String(valor) : valor.toISOString().substring(0, 10);
    }

    var texto = String(valor).trim();
    var partesData = /^(\d{4}-\d{2}-\d{2})/.exec(texto);
    return partesData ? partesData[1] : texto;
  }

  // Reaproveitada tanto por Admissão/Alteração (Folha) quanto por Desligamento —
  // dispara o scheduler de elegibilidade flex (ID_BRH_PLANO_ELEGIBILIDADE_FLEX nulo).
  function registrarHistoricoElegibilidade(idColaborador, evento, dataEvento) {
    src.require('dao').getDao('BRH_ELEGIBILIDADE_HISTORICO').insert({
      id_brh_colaborador: idColaborador,
      ds_evento: evento,
      dt_evento: dataEvento || new Date(),
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
  }

  var GRUPO_USUARIO_COLABORADOR = 'c517fa72-9d64-4f73-883c-5abf8671c58d';

  function criarOuReativarUsuario(colaborador) {
    if (!utils.campoPreenchido(colaborador.Email)) return null;
    try {
      var usuarioExistente = src.require('dao').getDao('CORE_USER')
      .filter({ ds_email: colaborador.Email })
      .find().first();

      if (!usuarioExistente) {
        var novoUsuario = {
          ds_users: colaborador.NomeCompletoColaborador,
          ds_loginname: colaborador.Email,
          ds_email: colaborador.Email,
          id_language: 1,
          do_inactive: 'N',
          dev: 'N'
        };
        src.require('dao').getDao('CORE_USER').insert(novoUsuario);
        src.require('dao').getDao('BRH_USUARIO').insert({ id_users: novoUsuario.id_users });
        adicionarAoGrupoColaborador(novoUsuario.id_users);
        return novoUsuario;
      }

      if (usuarioExistente.do_inactive === 'Y') {
        src.require('dao').getDao('CORE_USER')
          .filter({ id_users: usuarioExistente.id_users })
          .update({ do_inactive: 'N' });
        adicionarAoGrupoColaborador(usuarioExistente.id_users);
      }
      return usuarioExistente;
    } catch (e) {
      logger.error('Erro ao criar/reativar usuário do colaborador', e);
      return null;
    }
  }

  function adicionarAoGrupoColaborador(userId) {
    var grupo = src.require('dao').getDao('core_usergroup')
    .filter({ ds_key: GRUPO_USUARIO_COLABORADOR })
    .find().first();
    if (!grupo) return;
    var jaVinculado = src.require('dao').getDao('CORE_USERGROUP_USERS')
    .filter({ id_usergroup: grupo.id_usergroup, id_users: userId })
    .find().first();
    if (jaVinculado) return;
    src.require('dao').getDao('CORE_USERGROUP_USERS').insert({
      id_usergroup: grupo.id_usergroup,
      id_users: userId
    });
  }

  // Resolve/cria BRH_GRAU_PARENTESCO por DS_CODIGOFOLHA. Se o código já existe com um
  // DS_NOME diferente do recebido, o cadastro existente vence (nunca renomeia, nunca
  // duplica) — apenas registra aviso de divergência. Se não existe, cria com a
  // classificação técnica resolvida por resolverTipoGrauParentesco, avisando quando cai
  // no fallback "Outros".
  function resolverGrauParentesco(codigoFolha, nomeParentesco, idGrupoEconomico, resultado) {
    if (!utils.campoPreenchido(codigoFolha)) return '';
    var codigo = codigoFolha.toString();
    var nome = utils.textoLimpo(nomeParentesco);

    var existente = utils.buscarUm('BRH_GRAU_PARENTESCO', { ds_codigofolha: codigo });
    if (existente) {
      if (utils.campoPreenchido(nome) && normalizarNomeComparacao(existente.ds_nome) !== normalizarNomeComparacao(nome)) {
        resultado.avisos.push(
          'Grau de parentesco com código "' + codigo + '" já cadastrado com nome diferente (cadastro: "' +
          existente.ds_nome + '", arquivo: "' + nome + '"). Cadastro existente mantido.'
        );
      }
      return existente.id_brh_grau_parentesco;
    }

    var opTipo = resolverTipoGrauParentesco(nome);
    var idNovo = criarGrauParentesco(codigo, nome, opTipo, idGrupoEconomico);
    if (!parentescoTemClassificacaoEspecifica(nome)) {
      resultado.avisos.push(
        'Grau de parentesco novo criado com classificação técnica Outros. Código folha: ' + codigo +
        ' | Parentesco: ' + nome + ' | OP_TIPOGRAUPARENTESCO: ' + opTipo
      );
    }
    return idNovo;
  }

  function montarDependenteMapeado(dependente, idColaborador, idGrupoEconomico, resultado) {
    return {
      Nome: utils.textoLimpo(dependente.Nome),
      CPF: utils.formatarCpf(dependente.CPF),
      DataNascimento: utils.validaData(dependente.DataNascimento),
      Sexo: dependente.Sexo,
      CodigoGrauParentescoBrhain: resolverGrauParentesco(dependente.CodigoGrauParentesco, dependente.GrauParentesco, idGrupoEconomico, resultado),
      id_brh_colaborador: idColaborador
    };
  }

  function montarPayloadDependente(dependente) {
    return {
      id_brh_colaborador: dependente.id_brh_colaborador,
      ds_nome: dependente.Nome,
      // CPF ausente grava null — nunca valor artificial (BRH_DEPENDENTE.DS_CPF é nullable).
      ds_cpf: utils.campoPreenchido(dependente.CPF) ? dependente.CPF : null,
      op_sexo: utils.mapeamentoSexo(dependente.Sexo),
      dt_nascimento: dependente.DataNascimento,
      // NR_IDADE é obrigatório (ver UtilsImportFolha.calcularIdade).
      nr_idade: utils.calcularIdade(dependente.DataNascimento),
      id_brh_grau_parentesco: dependente.CodigoGrauParentescoBrhain
    };
  }

  function normalizarNomeComparacao(valor) {
    return utils.textoLimpo(valor).toUpperCase();
  }

  // Identidade alternativa para dependente sem CPF: mesmo colaborador + parentesco +
  // nome + data de nascimento. Retorna todos os candidatos (o chamador decide o que
  // fazer com 0/1/N resultados — nunca escolhe arbitrariamente entre vários).
  function localizarDependentesPorChaveAlternativa(dependenteMapeado, idColaborador) {
    var nomeNormalizado = normalizarNomeComparacao(dependenteMapeado.Nome);
    var dataNormalizada = normalizarValorComparacao(dependenteMapeado.DataNascimento);

    var candidatos = src.require('knex')('BRH_DEPENDENTE')
      .select('ID_BRH_DEPENDENTE', 'DS_NOME', 'DS_CPF', 'OP_SEXO', 'DT_NASCIMENTO', 'ID_BRH_GRAU_PARENTESCO')
      .where('ID_BRH_COLABORADOR', idColaborador)
      .where('ID_BRH_GRAU_PARENTESCO', dependenteMapeado.CodigoGrauParentescoBrhain)
      .find() || [];

    var correspondencias = [];
    for (var i = 0; i < candidatos.length; i++) {
      var candidato = candidatos[i];
      var nomeCandidatoOk = normalizarNomeComparacao(candidato.ds_nome) === nomeNormalizado;
      var dataCandidatoOk = normalizarValorComparacao(candidato.dt_nascimento) === dataNormalizada;

      if (nomeCandidatoOk && dataCandidatoOk) {
        correspondencias.push(candidato);
      }
    }
    return correspondencias;
  }

  // Dependentes embutidos na linha do titular (lote REST legado / layout antigo).
  // O layout oficial de Dependente (arquivo separado) usa processarDependenteAvulso.
  function processarDependentes(listaDependentes, colaboradorInserido, idGrupoEconomico, resultado) {
    if (!listaDependentes || typeof listaDependentes.forEach !== 'function') return;
    listaDependentes.forEach(function(dependenteDto) {
      processarUmDependente(dependenteDto || {}, colaboradorInserido.id_brh_colaborador, idGrupoEconomico, resultado);
    });
  }

  function processarUmDependente(dependenteDto, idColaborador, idGrupoEconomico, resultado) {
    if (!utils.campoPreenchido(dependenteDto.CPF) || !utils.campoPreenchido(dependenteDto.Nome)) {
      // sem dependente nesta linha/registro — ignora silenciosamente
      return;
    }

    var dependente = montarDependenteMapeado(dependenteDto, idColaborador, idGrupoEconomico, resultado);
    var pendencias = utils.validarCamposObrigatorios(dependente, CAMPOS_OBRIGATORIOS_DEPENDENTE);
    if (pendencias.length) {
      resultado.avisos.push('Dependente "' + (dependente.Nome || '') + '" com dados inválidos: ' + pendencias.join(', '));
      return;
    }

    try {
      var dependenteExistente = utils.buscarUm('BRH_DEPENDENTE', {
        ds_cpf: dependente.CPF,
        id_brh_colaborador: idColaborador
      });
      var dados = montarPayloadDependente(dependente);
      if (dependenteExistente) {
        src.require('dao').getDao('BRH_DEPENDENTE')
          .filter({ id_brh_dependente: dependenteExistente.id_brh_dependente })
          .update(dados);
      } else {
        src.require('dao').getDao('BRH_DEPENDENTE').insert(dados);
      }
    } catch (e) {
      logger.error('Erro ao tratar dependente do colaborador ' + idColaborador, e);
      resultado.avisos.push('Erro ao tratar dependente "' + (dependente.Nome || '') + '": ' + (e.message || e.toString()));
    }
  }

  // Núcleo do layout oficial "Folha - Dependente" (arquivo separado do titular).
  // dependenteAvulso: { CodigoEmpresa, MatriculaTitular, CPFTitular, Nome, CPF,
  //   DataNascimento, Sexo, CodigoGrauParentesco, GrauParentesco }
  function processarDependenteAvulso(dependenteAvulso) {
    var resultado = { sucesso: true, acao: null, idDependente: null, mensagens: [], avisos: [] };
    dependenteAvulso = dependenteAvulso || {};

    try {
      var idGrupoEconomico = obterIdGrupoEconomico();
      if (!idGrupoEconomico) {
        resultado.sucesso = false;
        resultado.mensagens.push('Grupo econômico padrão não configurado.');
        return resultado;
      }

      var codigoEmpresa = utils.textoLimpo(dependenteAvulso.CodigoEmpresa);
      var matriculaTitular = utils.textoLimpo(dependenteAvulso.MatriculaTitular);

      if (!utils.campoPreenchido(codigoEmpresa)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Empresa não encontrada.');
        return resultado;
      }
      if (!utils.campoPreenchido(matriculaTitular)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Matrícula do titular não encontrada.');
        return resultado;
      }

      var idEmpresa = utils.mapeamentoCodigoFolha('BRH_EMPRESA', codigoEmpresa, 'ID_BRH_EMPRESA');
      if (!utils.campoPreenchido(idEmpresa)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Empresa não encontrada pelo código de folha.');
        return resultado;
      }

      var titular = utils.buscarUm('BRH_COLABORADOR', {
        id_brh_empresa: idEmpresa,
        ds_matricula: matriculaTitular
      });
      if (!titular) {
        resultado.sucesso = false;
        resultado.mensagens.push('Titular não encontrado.');
        return resultado;
      }

      var cpfTitularArquivo = utils.formatarCpf(dependenteAvulso.CPFTitular);
      if (utils.campoPreenchido(cpfTitularArquivo) && utils.campoPreenchido(titular.ds_cpf) && cpfTitularArquivo !== titular.ds_cpf) {
        resultado.sucesso = false;
        resultado.mensagens.push('CPF do titular diverge do cadastro localizado (arquivo: ' + cpfTitularArquivo + ', cadastro: ' + titular.ds_cpf + ').');
        return resultado;
      }

      if (!utils.campoPreenchido(dependenteAvulso.Nome)) {
        resultado.sucesso = false;
        resultado.mensagens.push('Nome do dependente não informado — campo obrigatório.');
        return resultado;
      }

      var dependenteMapeado = montarDependenteMapeado(dependenteAvulso, titular.id_brh_colaborador, idGrupoEconomico, resultado);
      var pendencias = utils.validarCamposObrigatorios(dependenteMapeado, CAMPOS_OBRIGATORIOS_DEPENDENTE);
      if (pendencias.length) {
        resultado.sucesso = false;
        resultado.mensagens.push('Dependente com dados inválidos: ' + pendencias.join(', '));
        return resultado;
      }

      var temCpf = utils.campoPreenchido(dependenteMapeado.CPF);
      var dependenteExistente = null;

      if (temCpf) {
        dependenteExistente = utils.buscarUm('BRH_DEPENDENTE', {
          ds_cpf: dependenteMapeado.CPF,
          id_brh_colaborador: titular.id_brh_colaborador
        });
      }

      if (!dependenteExistente) {
        var correspondencias = localizarDependentesPorChaveAlternativa(dependenteMapeado, titular.id_brh_colaborador);
        if (correspondencias.length > 1) {
          resultado.sucesso = false;
          resultado.mensagens.push('Mais de um dependente sem CPF corresponde à chave alternativa.');
          return resultado;
        }
        if (correspondencias.length === 1) {
          dependenteExistente = correspondencias[0];
        }
      }

      var dados = montarPayloadDependente(dependenteMapeado);

      if (dependenteExistente) {
        var cpfPreenchidoAgora = temCpf && !utils.campoPreenchido(dependenteExistente.ds_cpf);
        // Carga atual sem CPF nunca apaga um CPF já cadastrado (mesma regra de UPDATE
        // seletivo já usada no Titular: campo ausente na origem preserva o valor atual).
        if (!temCpf) {
          dados.ds_cpf = utils.campoPreenchido(dependenteExistente.ds_cpf) ? dependenteExistente.ds_cpf : null;
        }

        if (!possuiAlteracaoDependente(dados, dependenteExistente)) {
          resultado.acao = 'semAlteracao';
          resultado.idDependente = dependenteExistente.id_brh_dependente;
          resultado.mensagens.push('Dependente já sincronizado.');
          if (!temCpf) resultado.avisos.push('Dependente permanece sem CPF.');
          return resultado;
        }

        dados.id_brh_dependente = dependenteExistente.id_brh_dependente;
        src.require('dao').getDao('BRH_DEPENDENTE')
          .filter({ id_brh_dependente: dependenteExistente.id_brh_dependente })
          .update(dados);
        resultado.acao = 'atualizado';
        resultado.idDependente = dependenteExistente.id_brh_dependente;
        if (cpfPreenchidoAgora) {
          resultado.mensagens.push('CPF do dependente preenchido em registro existente (CPF anterior: -, CPF novo: ' + dados.ds_cpf + ').');
        } else {
          resultado.mensagens.push('Dependente atualizado.');
        }
        if (!temCpf) resultado.avisos.push('Dependente permanece sem CPF.');
      } else {
        src.require('dao').getDao('BRH_DEPENDENTE').insert(dados);
        resultado.acao = 'criado';
        resultado.idDependente = dados.id_brh_dependente;
        resultado.mensagens.push('Dependente criado.');
        if (!temCpf) resultado.avisos.push('Dependente cadastrado sem CPF.');
      }
    } catch (e) {
      logger.error('Erro ao processar dependente', e);
      resultado.sucesso = false;
      resultado.mensagens.push('Erro ao processar dependente: ' + (e.message || e.toString()));
    }
    return resultado;
  }

  function possuiAlteracaoDependente(dadosNovos, existente) {
    var camposComparaveis = ['ds_nome', 'op_sexo', 'id_brh_grau_parentesco', 'ds_cpf'];
    var mudou = camposComparaveis.some(function(campo) {
      return normalizarValorComparacao(dadosNovos[campo]) !== normalizarValorComparacao(existente[campo]);
    });
    if (mudou) return true;
    return normalizarValorComparacao(dadosNovos.dt_nascimento) !== normalizarValorComparacao(existente.dt_nascimento);
  }

  return {
    // núcleo — usado pela tela de importação de Excel (uma linha por vez) e pelo lote REST
    'processarColaborador': processarColaborador,
    // núcleo do layout oficial "Folha - Dependente" (arquivo separado)
    'processarDependenteAvulso': processarDependenteAvulso,
    // reaproveitado por Folha - Desligamento
    'registrarHistoricoElegibilidade': registrarHistoricoElegibilidade,
    'obterIdGrupoEconomico': obterIdGrupoEconomico,
    'resolverOuCriarSituacao': resolverOuCriarSituacao,
    // lote — usado pelo endpoint POST
    'importFolha': importarTitularesDependentes
  };
})();
