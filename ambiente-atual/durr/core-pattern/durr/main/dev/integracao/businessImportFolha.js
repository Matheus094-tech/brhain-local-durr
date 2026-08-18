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

  var CAMPOS_OBRIGATORIOS_DEPENDENTE = [
    { chave: 'Nome', msg: 'Nome não encontrado' },
    { chave: 'CPF', msg: 'CPF não encontrado' },
    { chave: 'CodigoGrauParentescoBrhain', msg: 'Grau de Parentesco não encontrado' },
    { chave: 'DataNascimento', msg: 'Data de Nascimento não encontrada' },
    { chave: 'Sexo', msg: 'Sexo não encontrado' }
  ];

  function processarColaborador(colaborador) {
    var resultado = { sucesso: true, idColaborador: null, mensagens: [], avisos: [] };
    colaborador = colaborador || {};

    try {
      var grupoEconomico = obterGrupoEconomico(colaborador.CodigoGrupoEconomico);
      if (!grupoEconomico) {
        resultado.sucesso = false;
        resultado.mensagens.push('Grupo econômico padrão não configurado.');
        return resultado;
      }

      var mapeado = montarColaboradorMapeado(colaborador, grupoEconomico);
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
          registrarHistoricoElegibilidade(colaboradorInserido.id_brh_colaborador, 'Alteração', null);
        }        
      } else {
        colaboradorInserido = criarColaborador(mapeado);
        if (colaboradorInserido) {
          registrarHistoricoElegibilidade(colaboradorInserido.id_brh_colaborador, 'Admissão', colaborador.DataAdmissao);
        }
      }

      if (!colaboradorInserido) {
        resultado.sucesso = false;
        resultado.mensagens.push('Não foi possível criar/atualizar o colaborador.');
        return resultado;
      }

      resultado.idColaborador = colaboradorInserido.id_brh_colaborador;
      processarDependentes(colaborador.Dependentes, colaboradorInserido, resultado);
    } catch (e) {
      logger.error('Erro ao processar colaborador', e);
      resultado.sucesso = false;
      resultado.mensagens.push('Erro ao processar colaborador: ' + (e.message || e.toString()));
    }
    return resultado;
  }

  function obterGrupoEconomico(codigo) {
    if (utils.campoPreenchido(codigo)) {
      var id = utils.mapeamentoCodigoFolha('BRH_GRUPO_ECONOMICO', codigo, 'ID_BRH_GRUPO_ECONOMICO');
      if (id) return { id_brh_grupo_economico: id };
    }
    return src.require('knex')('BRH_GRUPO_ECONOMICO').findFirst();
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
    CPF_DEPENDENTE: 'CPF Dependente',
    NOME_DEPENDENTE: 'Nome Dependente',
    DATA_NASCIMENTO_DEPENDENTE: 'Data de Nascimento Dependente',
    SEXO_DEPENDENTE: 'Sexo Dependente'
  };

  function mapearLinhaPlanilhaParaColaborador(linha) {
    var temDependente = utils.campoPreenchido(linha[COLUNAS.CPF_DEPENDENTE]) && utils.campoPreenchido(linha[COLUNAS.NOME_DEPENDENTE]);
    return {
      CodigoGrupoEconomico: null,
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
      CodigoCargo: linha[COLUNAS.FUNCAO_CODIGO],
      Cargo: linha[COLUNAS.FUNCAO_NOME],
      RG: linha[COLUNAS.IDENTIDADE_TITULAR],
      SituacaoColaborador: linha[COLUNAS.SITUACAO_EMPREGADO],
      CodigoSindicato: linha[COLUNAS.SINDICATO_CODIGO],
      Sindicato: linha[COLUNAS.SINDICATO_NOME],
      DataAdmissao: linha[COLUNAS.DATA_ADMISSAO],
      EmailCorporativo: linha[COLUNAS.EMAIL],
      EmailPessoal: null,
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
        CodigoGrauParentesco: linha[COLUNAS.PARENTESCO_CODIGO]
      }] : []
    };
  }

  function montarColaboradorMapeado(colaborador, grupoEconomico) {
    return {
      CodigoGrupoEconomicoBrhain: grupoEconomico['id_brh_grupo_economico'],
      CodigoEmpresaBrhain: utils.mapeamentoCodigoFolha('BRH_EMPRESA', colaborador.CodigoEmpresa, 'ID_BRH_EMPRESA'),
      CodigoVinculoEmpregaticioBrhain: utils.mapeamentoCodigoFolha('BRH_VINCULO_EMPREGATICIO', colaborador.CodigoVinculoEmpregaticio, 'ID_BRH_VINCULO_EMPREGATICIO'),
      CodigoSindicatoBrhain: utils.mapeamentoCodigoFolhaOuCriar('BRH_SINDICATO', colaborador.CodigoSindicato, colaborador.Sindicato, 'ID_BRH_SINDICATO', grupoEconomico['id_brh_grupo_economico']),
      CodigoCargoBrhain: utils.mapeamentoCodigoFolhaOuCriar('BRH_CARGO', colaborador.CodigoCargo, colaborador.Cargo, 'ID_BRH_CARGO', grupoEconomico['id_brh_grupo_economico']),
      CodigoSituacaoColaboradorBrhain: utils.mapeamentoCodigoFolha('BRH_SITUACAO_COLABORADOR', colaborador.SituacaoColaborador, 'ID_BRH_SITUACAO_COLABORADOR'),
      CodigoEstadoCivilBrhain: utils.mapeamentoCodigoFolha('BRH_ESTADO_CIVIL', colaborador.EstadoCivil, 'ID_BRH_ESTADO_CIVIL'),
      //CodigoMunicipioBrhain: mapeamentoCodigoFolha(colaborador.CidadePessoal, colaborador.UFPessoal),
      //CodigoUFBrhain: colaborador.UFPessoal,

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

      Email: utils.campoPreenchido(colaborador.EmailCorporativo) ? utils.textoLimpo(colaborador.EmailCorporativo) : utils.textoLimpo(colaborador.EmailPessoal),
      CEP: utils.textoLimpo(colaborador.CEPPessoal),
      Logradouro: utils.textoLimpo(colaborador.LogradouroPessoal),
      Numero: utils.textoLimpo(colaborador.NumeroPessoal),
      Complemento: utils.textoLimpo(colaborador.ComplementoPessoal),
      Bairro: utils.textoLimpo(colaborador.BairroPessoal),

      NumeroBanco: utils.textoLimpo(colaborador.Banco),
      NomeBanco: utils.textoLimpo(colaborador.NomeBanco)
    };
  }

  function buscarMunicipioIdPorNome(nomeMunicipio, uf) {
    if (!utils.campoPreenchido(nomeMunicipio)) return null;
    var municipio = utils.buscarUm('BRH_MUNICIPIO', {
      ds_nome: nomeMunicipio.toString().trim(),
      ds_uf: utils.textoLimpo(uf)
    });
    return municipio ? municipio['id_brh_municipio'] : null;
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

  function montarPayloadColaborador(colaborador) {
    return {
      id_brh_grupo_economico: colaborador.CodigoGrupoEconomicoBrhain,
      id_brh_empresa: colaborador.CodigoEmpresaBrhain,
      id_brh_vinculo_empregaticio: colaborador.CodigoVinculoEmpregaticioBrhain,
      id_brh_sindicato: colaborador.CodigoSindicatoBrhain || null,
      id_brh_cargo: colaborador.CodigoCargoBrhain,
      id_brh_situacao_colaborador: colaborador.CodigoSituacaoColaboradorBrhain,
      id_brh_estado_civil: colaborador.CodigoEstadoCivilBrhain || null,
      id_brh_municipio: colaborador.CodigoMunicipioBrhain || null,
      id_brh_uf: colaborador.CodigoUFBrhain || null,
      op_sexo: utils.mapeamentoSexo(colaborador.Sexo),
      ds_matricula: colaborador.MatriculaColaborador,
      ds_nome: colaborador.NomeCompletoColaborador,
      ds_nomesocial: colaborador.NomeSocialColaborador,
      dt_nascimento: colaborador.DataNascimento,
      dt_admissao: colaborador.DataAdmissao,
      ds_nomemae: colaborador.NomeMae,
      ds_nomepai: colaborador.NomePai,
      ds_cpf: colaborador.CPF,
      ds_rg: colaborador.RG || null,
      ds_emailcorporativo: colaborador.Email || null,
      ds_cep: colaborador.CEP || null,
      ds_logradouro: colaborador.Logradouro || null,
      ds_logradouronumero: colaborador.Numero || null,
      ds_complemento: colaborador.Complemento || null,
      ds_bairro: colaborador.Bairro || null,
      ds_numerobanco: colaborador.NumeroBanco || null,
      ds_nomebanco: colaborador.NomeBanco || null
    };
  }

  function criarColaborador(colaborador) {
    var usuario = criarOuReativarUsuario(colaborador);
    colaborador['id_core_user'] = usuario ? usuario['id_users'] : null;

    var dados = montarPayloadColaborador(colaborador);
    dados.id_core_user = colaborador['id_core_user'];
    src.require('dao').getDao('BRH_COLABORADOR').insert(dados);
    return dados;
  }

  function atualizarColaborador(colaborador, colaboradorAtual) {
    var dadosComparacao = montarPayloadColaborador(colaborador);

    if (!possuiAlteracaoElegibilidade(dadosComparacao, colaboradorAtual)) {
      return {
        colaborador: colaboradorAtual,
        atualizado: false
      };
    }

    var usuario = criarOuReativarUsuario(colaborador);
    colaborador['id_core_user'] = usuario ? usuario['id_users'] : colaboradorAtual['id_core_user'];

    var dados = dadosComparacao;
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

  function normalizarValorComparacao(valor) {
    if (valor === null || typeof valor === 'undefined' || valor === '') return '';

    if (valor instanceof Date) {
      return isNaN(valor.getTime()) ? String(valor) : valor.toISOString().substring(0, 10);
    }

    // Datas do banco podem retornar como Date ou como texto com horário/timezone.
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(valor)) {
      return valor.substring(0, 10);
    }

    return String(valor).trim();
  }

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

  function montarDependenteMapeado(dependente, colaboradorInserido) {
    return {
      Nome: utils.textoLimpo(dependente.Nome),
      CPF: utils.formatarCpf(dependente.CPF),
      DataNascimento: utils.validaData(dependente.DataNascimento),
      Sexo: dependente.Sexo,
      CodigoGrauParentescoBrhain: utils.mapeamentoCodigoFolha('BRH_GRAU_PARENTESCO', dependente.CodigoGrauParentesco, 'ID_BRH_GRAU_PARENTESCO'),
      id_brh_colaborador: colaboradorInserido.id_brh_colaborador
    };
  }

  function montarPayloadDependente(dependente) {
    return {
      id_brh_colaborador: dependente.id_brh_colaborador,
      ds_nome: dependente.Nome,
      ds_cpf: dependente.CPF,
      op_sexo: utils.mapeamentoSexo(dependente.Sexo),
      dt_nascimento: dependente.DataNascimento,
      id_brh_grau_parentesco: dependente.CodigoGrauParentescoBrhain      
    };
  }

  function processarDependentes(listaDependentes, colaboradorInserido, resultado) {
    if (!listaDependentes || typeof listaDependentes.forEach !== 'function') return;
    listaDependentes.forEach(function(dependenteDto) {
      processarUmDependente(dependenteDto || {}, colaboradorInserido, resultado);
    });
  }

  function processarUmDependente(dependenteDto, colaboradorInserido, resultado) {
    if (!utils.campoPreenchido(dependenteDto.CPF) || !utils.campoPreenchido(dependenteDto.Nome)) {
      // sem dependente nesta linha/registro — ignora silenciosamente
      return;
    }

    var dependente = montarDependenteMapeado(dependenteDto, colaboradorInserido);
    var pendencias = utils.validarCamposObrigatorios(dependente, CAMPOS_OBRIGATORIOS_DEPENDENTE);
    if (pendencias.length) {
      resultado.avisos.push('Dependente "' + (dependente.Nome || '') + '" com dados inválidos: ' + pendencias.join(', '));
      return;
    }

    try {
      var dependenteExistente = utils.buscarUm('BRH_DEPENDENTE', {
        ds_cpf: dependente.CPF,
        id_brh_colaborador: colaboradorInserido.id_brh_colaborador
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
      logger.error('Erro ao tratar dependente do colaborador ' + colaboradorInserido.id_brh_colaborador, e);
      resultado.avisos.push('Erro ao tratar dependente "' + (dependente.Nome || '') + '": ' + (e.message || e.toString()));
    }
  }

  return {
    // núcleo — usado pela tela de importação de Excel (uma linha por vez)
    'processarColaborador': processarColaborador,
    // lote — usado pelo endpoint POST
    'importFolha': importarTitularesDependentes
  };
})();