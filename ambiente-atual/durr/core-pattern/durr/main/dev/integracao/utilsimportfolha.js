/*
 * UtilsImportFolha
 * durr.main.dev.integracao.utilsimportfolha
 * 
 */
module.exports = (function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.integracao.utilsimportfolha');

  var src = require('plusoftcrm.libs.main.source')({
    'credentials': 'inpaas.core.user.credentials'  
  });

  function normalizarChaves(objeto) {
    if (!objeto) return {};
    var normalizado = {};
    try {
      Object.keys(objeto).forEach(function(chave) {
        normalizado[chave.trim()] = objeto[chave];
      });
    } catch (e) {
      return objeto;
    }
    return normalizado;
  }

  function removerMascara(valor) {
    if (valor == null) return '';
    return valor.toString().replace(/[^0-9]/g, '');
  }

  function formatarCpf(valor) {
    var digitos = removerMascara(valor);
    if (!digitos) return '';
    while (digitos.length < 11) {
      digitos = '0' + digitos;
    }
    return digitos;
  }

  function valorOuVazio(valor) {
    return (valor == null) ? '' : valor;
  }

  function campoPreenchido(valor) {
    return valorOuVazio(valor).toString().trim() !== '';
  }

  function textoLimpo(valor) {
    return campoPreenchido(valor) ? valor.toString().trim() : '';
  }

  function mapeamentoSexo(tipo) {
    if (!campoPreenchido(tipo)) return null;
    var normalizado = tipo.toString().trim().toLowerCase();
    if (normalizado.indexOf('femin') === 0) return 'F';
    if (normalizado.indexOf('masc') === 0) return 'M';
    return 'O';
  }

  function validaData(data) {
    if (!campoPreenchido(data)) return '';
    var dataObj = (data instanceof Date) ? data : new Date(data);
    if (isNaN(dataObj.getTime())) return '';
    var minDate = new Date(1753, 0, 1);
    var maxDate = new Date(9999, 11, 31);
    return (dataObj >= minDate && dataObj <= maxDate) ? dataObj : '';
  }

  function converterDataBr(data) {
    if (!campoPreenchido(data)) return null;
    data = String(data).trim();
    var partes = data.split('/');
    if (partes.length !== 3) return data;
    var mes = parseInt(partes[0], 10);
    var dia = parseInt(partes[1], 10);
    var ano = parseInt(partes[2], 10);
    if (ano < 100) {
      ano += (ano >= 50 ? 1900 : 2000);
    }
    return new Date(ano, mes - 1, dia);
  }

  function validarCamposObrigatorios(objeto, camposObrigatorios) {
    var pendencias = [];
    camposObrigatorios.forEach(function(campo) {
      if (!campoPreenchido(objeto[campo.chave])) {
        pendencias.push(campo.msg);
      }
    });
    return pendencias;
  }

  function buscarUm(entidade, filtros) {
    return src.require('dao').getDao(entidade).filter(filtros).find().first();
  }

  function nomeEntidadeParaLog(entidade) {
    var label = src.require('knex')('CORE_LABEL CL')
      .select('CL.DS_DESCRIPTION as nome_entidade')
      .where('DS_KEY', 'label.' + entidade)
      .findFirst();
    return label ? label['nome_entidade'] : entidade;
  }

  function mapeamentoCodigoFolha(entidade, codigoFolha, colunaRetorno) {
    if (!campoPreenchido(codigoFolha)) return '';
    var resultado = buscarUm(entidade, { ds_codigofolha: codigoFolha.toString() });
    if (resultado) return resultado[colunaRetorno];
    logger.warn(
      'mapeamentoCodigoFolha',
      'Código "' + codigoFolha + '" não encontrado em ' + nomeEntidadeParaLog(entidade)
    );
    return '';
  }

  function mapeamentoCodigoFolhaOuCriar(entidade, codigoFolha, nomeDescricao, colunaRetorno, idGrupoEconomico) {
    if (!campoPreenchido(codigoFolha)) return '';
    var resultado = buscarUm(entidade, { ds_codigofolha: codigoFolha.toString() });
    if (resultado) return resultado[colunaRetorno];

    var novoRegistro = {
      ds_codigofolha: codigoFolha.toString(),
      id_brh_grupo_economico: idGrupoEconomico || 1,
      ds_nome: campoPreenchido(nomeDescricao) ? nomeDescricao.toString() : codigoFolha.toString(),
      op_ativo: 'Y'
    };
    var idGerado = src.require('knex')(entidade).insert(novoRegistro);
    idGerado = Array.isArray(idGerado) ? idGerado[0] : idGerado;
    logger.info(
      'mapeamentoCodigoFolhaOuCriar',
      'Novo registro criado em ' + entidade + ' para o código "' + codigoFolha + '"'
    );
    return idGerado;
  }

  function mapeamentoPorNome(entidade, colunaNome, valor, colunaRetorno) {
    if (!campoPreenchido(valor)) return '';
    var filtro = {};
    filtro[colunaNome] = valor.toString().trim();
    var resultado = buscarUm(entidade, filtro);
    if (resultado) return resultado[colunaRetorno];
    logger.warn(
      'mapeamentoPorNome',
      'Valor "' + valor + '" não encontrado em ' + entidade + '.' + colunaNome
    );
    return '';
  }

  function criarRelatorioImportacao() {
    return {
      sucesso: true,
      totalRecebidos: 0,
      totalProcessados: 0,
      totalComErro: 0,
      log: []
    };
  }

  function registrarSucesso(relatorio, referencia, mensagem, dados) {
    relatorio.totalProcessados++;
    relatorio.log.push({ referencia: referencia, tipo: 'sucesso', mensagem: mensagem, dados: dados || null });
  }

  function registrarErro(relatorio, referencia, mensagem, dados) {
    relatorio.sucesso = false;
    relatorio.totalComErro++;
    relatorio.log.push({ referencia: referencia, tipo: 'erro', mensagem: mensagem, dados: dados || null });
  }

  function registrarAviso(relatorio, referencia, mensagem, dados) {
    relatorio.log.push({ referencia: referencia, tipo: 'aviso', mensagem: mensagem, dados: dados || null });
  }

  return {
    normalizarChaves: normalizarChaves,
    removerMascara: removerMascara,
    formatarCpf: formatarCpf,
    campoPreenchido: campoPreenchido,
    textoLimpo: textoLimpo,
    mapeamentoSexo: mapeamentoSexo,
    validaData: validaData,
    converterDataBr: converterDataBr,
    validarCamposObrigatorios: validarCamposObrigatorios,
    buscarUm: buscarUm,
    mapeamentoCodigoFolha: mapeamentoCodigoFolha,
    mapeamentoCodigoFolhaOuCriar: mapeamentoCodigoFolhaOuCriar,
    mapeamentoPorNome: mapeamentoPorNome,
    criarRelatorioImportacao: criarRelatorioImportacao,
    registrarSucesso: registrarSucesso,
    registrarErro: registrarErro,
    registrarAviso: registrarAviso
  };
})();