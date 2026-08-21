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

  // Época do Excel (1899-12-30) em componentes locais — a conversão de serial usa
  // aritmética de data LOCAL (nunca UTC/epoch em milissegundos): somar dias direto no
  // construtor local evita o deslocamento de 1 dia observado em servidores com
  // timezone negativo (ex.: UTC-3), onde "meia-noite UTC" já é o dia anterior local.
  var EPOCA_EXCEL_ANO = 1899;
  var EPOCA_EXCEL_MES = 11; // dezembro (0-indexado)
  var EPOCA_EXCEL_DIA = 30;

  // Layout oficial de Folha: onrecord entrega texto já formatado pelo DataFormatter
  // (Apache POI), nunca Number/Date nativo. Formato confirmado em DEV via sonda real:
  // "M/d/yy" (sem zero à esquerda, ano com 2 dígitos) — ex.: "12/4/97", "8/10/26".
  // Pivô de século fixo, confirmado contra exemplos reais (97/85/88 → 19xx; 02/08/26 →
  // 20xx): yy < 50 → 20yy, yy >= 50 → 19yy. Aceita também o serial Excel bruto e ISO
  // como rede de segurança.
  function converterDataOficial(valor) {
    if (!campoPreenchido(valor)) return null;
    var texto = valor.toString().trim();

    if (/^\d+$/.test(texto)) {
      var serial = parseInt(texto, 10);
      if (!serial) return undefined;
      return new Date(EPOCA_EXCEL_ANO, EPOCA_EXCEL_MES, EPOCA_EXCEL_DIA + serial);
    }

    var partesIso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
    if (partesIso) {
      var dataIso = new Date(Number(partesIso[1]), Number(partesIso[2]) - 1, Number(partesIso[3]));
      return isNaN(dataIso.getTime()) ? undefined : dataIso;
    }

    var partesMDY = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(texto);
    if (partesMDY) {
      var mes = parseInt(partesMDY[1], 10);
      var dia = parseInt(partesMDY[2], 10);
      var anoTexto = partesMDY[3];
      var ano = parseInt(anoTexto, 10);
      if (anoTexto.length === 2) ano += (ano < 50 ? 2000 : 1900);
      var dataMDY = new Date(ano, mes - 1, dia);
      return isNaN(dataMDY.getTime()) ? undefined : dataMDY;
    }

    return undefined;
  }

  // BRH_DEPENDENTE.NR_IDADE é obrigatório (confirmado no legado brhain.rh.integracao.dependente,
  // que sempre calcula e envia esse campo em todo INSERT/UPDATE dessa entidade).
  function calcularIdade(dataNascimento) {
    var hoje = new Date();
    var idade = hoje.getFullYear() - dataNascimento.getFullYear();
    var aniversarioAindaNaoOcorreu =
      hoje.getMonth() < dataNascimento.getMonth() ||
      (hoje.getMonth() === dataNascimento.getMonth() && hoje.getDate() < dataNascimento.getDate());
    if (aniversarioAindaNaoOcorreu) idade--;
    return idade;
  }

  // O motor genérico (BusinessdelegateDataimportutils.onrecord) incrementa
  // importlog["nr_recordssuccess"] a cada linha processada sem exceção — mas o campo
  // físico real da entidade BRH_DATAIMP_IMPORTLOG, confirmado por evidência cruzada em
  // múltiplas rotinas legadas (brhain/rh/beneficio/implatacao/beneficios.js,
  // brhain/rh/beneficio/import/academia/{desconto,totalpass,wellhub}.js,
  // brhain/rh/integracao/import/basedigio.js) e pelo próprio business delegate do
  // formulário "Logs da importação" (brhain/rh/integracao/businessdelegate/
  // formlogerror.js:56, que lê importlog["nr_registrossucesso"] para exibir em tela),
  // é NR_REGISTROSSUCESSO — nunca gravado pelo motor genérico, que por isso sempre
  // persiste Sucessos=0 mesmo com registros processados com êxito.
  // Correção feita nas strategies DURR (onfinish), não no motor genérico: recalcula
  // Sucessos = Registros totais - Falhas e grava no campo físico real. onfinish é
  // chamado ANTES do UPDATE final em BRH_DATAIMP_IMPORTLOG (dataimportutils.js:514-522),
  // e importlog é o mesmo objeto por referência — mutar aqui é suficiente, não é
  // necessário (nem possível) retornar um novo objeto para o motor persistir.
  function finalizarContadoresImportacao(importlog) {
    if (!importlog) return importlog;
    var total = Number(importlog['nr_registros']) || 0;
    var falhas = Number(importlog['nr_falhas']) || 0;
    importlog['nr_registrossucesso'] = Math.max(0, total - falhas);
    return importlog;
  }

  function normalizarCep(valor) {
    var digitos = removerMascara(valor);
    if (!digitos) return '';
    while (digitos.length < 8) {
      digitos = '0' + digitos;
    }
    return digitos;
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

  // Resultado de getDao().find() é acessado em lowercase neste runtime,
  // mesmo quando o chamador informa a coluna em UPPERCASE (padrão de nome de coluna física).
  function mapeamentoCodigoFolha(entidade, codigoFolha, colunaRetorno) {
    if (!campoPreenchido(codigoFolha)) return '';
    var resultado = buscarUm(entidade, { ds_codigofolha: codigoFolha.toString() });
    if (resultado) return resultado[colunaRetorno.toLowerCase()];
    logger.warn(
      'mapeamentoCodigoFolha',
      'Código "' + codigoFolha + '" não encontrado em ' + nomeEntidadeParaLog(entidade)
    );
    return '';
  }

  function mapeamentoCodigoFolhaOuCriar(entidade, codigoFolha, nomeDescricao, colunaRetorno, idGrupoEconomico) {
    if (!campoPreenchido(codigoFolha)) return '';
    var resultado = buscarUm(entidade, { ds_codigofolha: codigoFolha.toString() });
    if (resultado) return resultado[colunaRetorno.toLowerCase()];

    var novoRegistro = {
      ds_codigofolha: codigoFolha.toString(),
      id_brh_grupo_economico: idGrupoEconomico || 1,
      ds_nome: campoPreenchido(nomeDescricao) ? nomeDescricao.toString() : codigoFolha.toString(),
      op_ativo: 'Y'
    };
    src.require('dao').getDao(entidade).insert(novoRegistro);
    logger.info(
      'mapeamentoCodigoFolhaOuCriar',
      'Novo registro criado em ' + entidade + ' para o código "' + codigoFolha + '"'
    );
    return novoRegistro[colunaRetorno.toLowerCase()];
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

  // Monta o bloco de diagnóstico funcional padronizado: "[TAG][STATUS]\nMotivo: ...\nLabel: valor...".
  // contexto: array de { label, valor }.
  function formatarDiagnostico(tag, status, motivo, contexto) {
    var linhas = ['[' + tag + '][' + status + ']', 'Motivo: ' + motivo];
    (contexto || []).forEach(function(item) {
      linhas.push(item.label + ': ' + (campoPreenchido(item.valor) ? item.valor : '-'));
    });
    return linhas.join('\n');
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
    converterDataOficial: converterDataOficial,
    normalizarCep: normalizarCep,
    calcularIdade: calcularIdade,
    finalizarContadoresImportacao: finalizarContadoresImportacao,
    validarCamposObrigatorios: validarCamposObrigatorios,
    buscarUm: buscarUm,
    mapeamentoCodigoFolha: mapeamentoCodigoFolha,
    mapeamentoCodigoFolhaOuCriar: mapeamentoCodigoFolhaOuCriar,
    mapeamentoPorNome: mapeamentoPorNome,
    formatarDiagnostico: formatarDiagnostico,
    criarRelatorioImportacao: criarRelatorioImportacao,
    registrarSucesso: registrarSucesso,
    registrarErro: registrarErro,
    registrarAviso: registrarAviso
  };
})();