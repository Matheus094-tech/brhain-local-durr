/*
 * BusinessUtilsCompraFlex
 * durr.main.dev.business.utilscompraflex
 *
 */
module.exports = (function () {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.business.utilscompraflex');

  var DESTINO_REFEICAO = 'REFEICAO';
  var DESTINO_MULTIBENEFICIOS = 'MULTIBENEFICIOS';

  // BRH_BENEFICIO.OP_STATUS: 1/2 vigente para compra; 3/4 não entram.
  var STATUS_BENEFICIO_VIGENTE = ['1', '2'];

  var MENSAGENS = {
    compraNaoEncontrada: 'Compra de benefício não encontrada.',
    produtoSemEstrategia: 'Produto sem estratégia de compra implementada: ',
    contratoPlanoDesconhecido: 'Contrato/plano sem mapeamento para o layout Flash: ',
    contratoPlanoSemCategoria: 'Contrato/plano sem categoria Flex configurada em BRH_CONTRATO_PLANO_CATEGORIA_FLEX: ',
    compraJaProcessada: 'Compra já possui detalhes gerados. Reprocessamento bloqueado.',
    referenciaInvalida: 'Referência da compra inválida (esperado MMAAAA, ex. 092026): ',
    nenhumBeneficioVigente: 'Nenhum benefício Flex vigente encontrado para a referência informada.',
    colaboradorSemCpf: 'Colaborador sem CPF cadastrado, ignorado na compra: ',
    empresaSemCnpj: 'Empresa sem CNPJ cadastrado, ignorado na compra: '
  };

  function campoPreenchido(valor) {
    return valor !== null && valor !== undefined && String(valor).trim() !== '';
  }

  function textoLimpo(valor) {
    return campoPreenchido(valor) ? String(valor).trim() : '';
  }

  function normalizarDocumento(valor, tamanho) {
    var digitos = campoPreenchido(valor) ? String(valor).replace(/[^0-9]/g, '') : '';
    if (!digitos) return '';
    while (digitos.length < tamanho) {
      digitos = '0' + digitos;
    }
    return digitos;
  }

  function normalizarCpf(valor) {
    return normalizarDocumento(valor, 11);
  }

  function normalizarCnpj(valor) {
    return normalizarDocumento(valor, 14);
  }

  function converterNumero(valor) {
    if (valor === null || valor === undefined || String(valor).trim() === '') return 0;
    var numero = Number(String(valor).replace(',', '.'));
    return isNaN(numero) ? 0 : numero;
  }

  function arredondarMoeda(valor) {
    return Math.round(converterNumero(valor) * 100) / 100;
  }

  function paraArray(listaOuArray) {
    var resultado = [];
    if (!listaOuArray) return resultado;
    listaOuArray.forEach(function (item) {
      resultado.push(item);
    });
    return resultado;
  }

  function referenciaValida(mes, ano) {
    if (!mes || !ano || mes < 1 || mes > 12 || ano < 2000) return null;
    return { mes: mes, ano: ano };
  }

  function parseReferencia(referencia) {
    if (!campoPreenchido(referencia)) return null;
    var texto = String(referencia).trim();

    if (/^\d{6}$/.test(texto)) {
      return referenciaValida(parseInt(texto.substring(0, 2), 10), parseInt(texto.substring(2), 10));
    }

    var partes = texto.split('/');
    if (partes.length === 2) {
      return referenciaValida(parseInt(partes[0], 10), parseInt(partes[1], 10));
    }

    return null;
  }

  function intervaloCompetencia(referencia) {
    var ref = parseReferencia(referencia);
    if (!ref) return null;
    return {
      inicio: new Date(ref.ano, ref.mes - 1, 1, 0, 0, 0, 0),
      fimExclusivo: new Date(ref.ano, ref.mes, 1, 0, 0, 0, 0)
    };
  }

  function referenciasIguais(referenciaA, referenciaB) {
    var a = parseReferencia(referenciaA);
    var b = parseReferencia(referenciaB);
    if (!a || !b) return false;
    return a.mes === b.mes && a.ano === b.ano;
  }

  function beneficioVigenteNaCompetencia(beneficio, intervalo) {
    if (!beneficio || !intervalo) return false;
    if (STATUS_BENEFICIO_VIGENTE.indexOf(String(beneficio.op_status)) === -1) return false;
    if (converterNumero(beneficio.vl_valor) <= 0) return false;

    var inicioVigencia = beneficio.dt_iniciovigencia ? new Date(beneficio.dt_iniciovigencia) : null;
    if (!inicioVigencia || inicioVigencia >= intervalo.fimExclusivo) return false;

    var terminoVigencia = beneficio.dt_terminovigencia ? new Date(beneficio.dt_terminovigencia) : null;
    if (terminoVigencia && terminoVigencia < intervalo.inicio) return false;

    return true;
  }

  // DS_CODIGOOPERADORA VR=Refeição, MULTI=Multibenefícios; nome do plano é fallback.
  function identificarDestinoPlanoFlex(contratoPlano) {
    if (!contratoPlano) return null;

    var codigoOperadora = textoLimpo(contratoPlano.ds_codigooperadora).toUpperCase();
    if (codigoOperadora === 'VR') return DESTINO_REFEICAO;
    if (codigoOperadora === 'MULTI') return DESTINO_MULTIBENEFICIOS;

    var nomePlano = textoLimpo(contratoPlano.ds_nomeplano).toUpperCase();
    if (nomePlano.indexOf('MULTIBENEF') !== -1) return DESTINO_MULTIBENEFICIOS;
    if (nomePlano.indexOf('REFEI') !== -1) return DESTINO_REFEICAO;

    return null;
  }

  // Bucket oposto recebe string "0": plusoftcrm.libs.main.excel trata 0 numérico como vazio.
  function montarLinhaLayoutFlash(dados) {
    var valor = arredondarMoeda(dados.valorBeneficio);
    var linha = {
      cnpj: normalizarCnpj(dados.cnpjEmpresa),
      nomeCompleto: textoLimpo(dados.nomeColaborador),
      cpf: normalizarCpf(dados.cpfColaborador),
      multibeneficios: null,
      alimentacaoRefeicao: null
    };

    if (dados.destino === DESTINO_MULTIBENEFICIOS) {
      linha.multibeneficios = valor;
      linha.alimentacaoRefeicao = '0';
    } else if (dados.destino === DESTINO_REFEICAO) {
      linha.alimentacaoRefeicao = valor;
      linha.multibeneficios = '0';
    }

    return linha;
  }

  return {
    DESTINO_REFEICAO: DESTINO_REFEICAO,
    DESTINO_MULTIBENEFICIOS: DESTINO_MULTIBENEFICIOS,
    MENSAGENS: MENSAGENS,
    campoPreenchido: campoPreenchido,
    textoLimpo: textoLimpo,
    normalizarCpf: normalizarCpf,
    normalizarCnpj: normalizarCnpj,
    converterNumero: converterNumero,
    arredondarMoeda: arredondarMoeda,
    paraArray: paraArray,
    parseReferencia: parseReferencia,
    intervaloCompetencia: intervaloCompetencia,
    referenciasIguais: referenciasIguais,
    beneficioVigenteNaCompetencia: beneficioVigenteNaCompetencia,
    identificarDestinoPlanoFlex: identificarDestinoPlanoFlex,
    montarLinhaLayoutFlash: montarLinhaLayoutFlash
  };
})();
