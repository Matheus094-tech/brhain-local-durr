/*
 * BusinessdelegateDataimportutils
 * brhain.rh.integracao.businessdelegate.dataimportutils
 * 
 */
(function (scope) {
  'use strict';/*
 * BusinessdelegateDataimportutils
 * brhain.rh.integracao.businessdelegate.dataimportutils
 * 
 */

  var logger = logging.withLogger('brhain.rh.integracao.businessdelegate.dataimportutils');

  var StoredFileBusinessDelegate = Java.type("br.com.inpaas.file.businessdelegate.StoredFileBusinessDelegate");
  var BufferedReader = Java.type("java.io.BufferedReader");
  var InputStreamReader = Java.type("java.io.InputStreamReader");
  var ByteArrayInputStream = Java.type("java.io.ByteArrayInputStream");
  var daoFactory = require("inpaas.core.entity.dao");
  var ArrayList = Java.type("java.util.ArrayList");
  var TO = Java.type("br.com.inpaas.fw.model.TO");
  var crmUtilsBusinessDelegate = require("brhain.rh.integracao.businessdelegate.utils");//delegate
  var coreUtilsBusinessDelegate = require("brhain.rh.integracao.coreUtilsBusinessDelegate");//delegate
  var SimpleDateFormat = Java.type("java.text.SimpleDateFormat");
  var log = require("inpaas.core.log");
  var Date = Java.type("java.util.Date");
  var SqlDate = Java.type("java.sql.Date");
  var Exception = Java.type("java.lang.Exception");
  var localization = Java.type("br.com.inpaas.localization.Localization").get(scriptContext);

  var FileData = Java.type("br.com.inpaas.fw.files.FileData");
  var fileService = require("inpaas.core.files");
  var String = Java.type("java.lang.String");

  var Thread = Java.type("java.lang.Thread");
  var CampaignId;
  var listImports = {
    "dao": "inpaas.core.entity.dao",
    "image_service": "brhain.rh.utils.service.ImageLinkGenerator",
    "php": "brhain.rh.utils.php",
    "user_info": "brhain.rh.utils.UserInfo",
    "sql_prevent": "brhain.rh.utils.service.sql_prevent_injection",
    // "helper" : "edusense.lxp.utils.helper"
  };

  function src(key) {
    return require(listImports[key]);
  }

  function getLayoutFields(layoutId) {
    return require('plusoftcrm.libs.main.knex')('BRH_DATAIMP_LAYOUTFIELD')
      .where('id_brh_dataimp_layout', new java.lang.Integer(layoutId))
      .select('id_brh_dataimp_layout id_layout')
      .select('ds_objetonome ds_objetobdname')
      .select('ds_campo ds_campobd')
      .select('do_analise do_analysis')
      .select('ds_formato ds_format')
      .select('nr_posicaodelimitada nr_delimitedposition')
      .select('nr_iniciofixado nr_fixedstart')
      .select('nr_fimfixado nr_fixedend')
      .select('do_acao do_action')
      .select('tx_descricao tx_description')
      .select('ds_chaveestrategica ds_strategykey')
      .select('nr_sequencia nr_sequence')
      .select('do_somentenumeros do_onlynumbers')
      .orderBy('nr_sequencia')
      .find();
  }

  function getFileRows(importlog, layout) {
    var coreFile = daoFactory.getDao("CORE_FILE").filter("ID_FILE").equalsTo(importlog["id_arquivo_importacao"]).find().first();

    var rows = [];

    if (['xls', 'xlsx'].indexOf(coreFile['ds_extension']) >= 0) {
      rows = require('plusoftcrm.libs.main.excel').toArray(importlog["id_arquivo_importacao"]);
    } else {
      var delimitador = layout["do_delimitador"];
      var fieldqualification = layout["do_qualificadorcampo"] == "D" ? "\"" : layout["do_qualificadorcampo"] == "S" ? "'" : null;

      var line = '';
      var reader = require("inpaas.core.files").read(importlog["id_arquivo_importacao"], function (index, line) {
        rows.push(getCollumns(fieldqualification, delimitador, line));
      });
    }    
  
    if (layout["do_cabecalho"] == "Y") {
      rows.shift();
    }
  

    return rows;
  }

  var importData = function (importlogid) {

    var importlog = daoFactory.getDao("BRH_DATAIMP_IMPORTLOG").filter("id_brh_dataimp_importlog").equalsTo(importlogid).findFirst();
    var importto = daoFactory.getDao("BRH_DATAIMP_IMPORTACAO").filter("ID_BRH_DATAIMP_IMPORTACAO").equalsTo(importlog["id_brh_dataimp_importacao"]).findFirst();
    
    logger.error('importtoimportto',importto);
    var layout = daoFactory.getDao("BRH_DATAIMP_LAYOUT").filter("id_brh_dataimp_layout").equalsTo(importlog["id_brh_dataimp_layout"]).findFirst();

    // var layoutfields = daoFactory.getDao("BRH_DATAIMP_LAYOUTFIELD").filter("id_brh_dataimp_layout").equalsTo(layout["id_brh_dataimp_layout"]).sort({ "NR_SEQUENCIA": "ASC" }).find();
    var layoutfields = getLayoutFields(layout["id_brh_dataimp_layout"]);

    var bf = getBufferedReaderByFile(importlog["id_arquivo_importacao"]);
    var decimalseparator = layout["do_separadorpadrao"];
    var dateformat = layout["ds_dataformatopadrao"];
    var delimitador = layout["do_delimitador"];
    var fieldqualification = layout["do_qualificadorcampo"] == "D" ? "\"" : layout["do_qualificadorcampo"] == "S" ? "'" : null;
    var formatDateLayout = "";
    var countErro = 0;
    var divisor = 1000;

    importlog["dt_inicio"] = new Date();

    // verificando se o layout possui estratégia
    var strategySource;

    try {
      strategySource = require(layout["ds_chaveestrategica"]);
    } catch (e) {
      strategySource = null; // não possui estratégia
      logger.error("error: %o", e);
      logger.error("O layout: " + layout["ds_layout"] + " não possui estratégia ou o arquivo não foi encontrado");

      //retorna como erro pois a importação só é via chave estratégica
      // return { 'message': 'error' };
    }

    // é executado a tentativa de executar o método onstart da estratégia caso exista
    if (strategySource && strategySource.hasOwnProperty('custom')) {

      //Verifica se o upload com a estretégia é custom  e muda a funcao e nao deixa executar o resto
      if (strategySource.custom) {
        var data_custom = [];
        var headers = [];

        var coreFile = daoFactory.getDao("CORE_FILE").filter("ID_FILE").equalsTo(importlog["id_arquivo_importacao"]).find().first();

        if (['xls', 'xlsx'].indexOf(coreFile['ds_extension']) >= 0) {
          var rows = require('plusoftcrm.libs.main.excel').toArray(importlog["id_arquivo_importacao"]);

          for (var i = 0; i < rows.length; i++) {
            if (i == 0 && layout["do_cabecalho"] == "Y") {
              for (var x = 0; x < rows[i].length; x++) {
                if (rows[i][x]) {
                  var desired = rows[i][x].replace(/[^\w\s]/gi, '');
                  desired = desired.trim().toLocaleLowerCase();
                  headers.push(desired);
                }
              }
            } else {
              var json_custom = {};

              for (var k = 0; k < rows[i].length; k++) {
                if (rows[i][k]) {
                  rows[i][k] = require('brhain.rh.utils.utils').removerAcentos(rows[i][k]);
                }

                json_custom[headers[k]] = rows[i][k];
              }

              data_custom.push(json_custom);
            }
          }
        } else {
          var line = '';
          var reader = require("inpaas.core.files").read(importlog["id_arquivo_importacao"], function (index, line) {

            if (index == 0 && layout["do_cabecalho"] == "Y") {
              var columns = getCollumns(fieldqualification, delimitador, line);
              for (var i = 0; i < columns.length; i++) {
                if (columns[i]) {
                  //tratar caracters special + espaços em branco
                  var desired = columns[i].replace(/[^\w\s]/gi, '');
                  desired = desired.trim().toLocaleLowerCase();
                  headers.push(desired);
                }
              }
            } else {
              //Aqui vai gerar o body que irá ser processado na chave custom
              var columns = getCollumns(fieldqualification, delimitador, line);
              var json_custom = {};
              for (var i = 0; i < columns.length; i++) {
                //Chave-Value do json dinamico
                columns[i] = columns[i].trim();


                if (columns[i]) {
                  columns[i] = require('brhain.rh.utils.utils').removerAcentos(columns[i]);
                }

                json_custom[headers[i]] = columns[i];
                //json_custom[headers[i]] = new String(columns[i].getBytes("ISO-8859-1"), "UTF-8");
              }
              data_custom.push(json_custom);
            }
          });
        }

        //Processa os dados
        strategySource.process(data_custom, importlog);

        return { 'message': 'success' };
      }
    }

    var rows = getFileRows(importlog, layout);

    // é executado a tentativa de executar o método onstart da estratégia caso exista
    if (strategySource && strategySource.hasOwnProperty('onstart')) {
      try {
        strategySource.onstart(importto); // o método onstart recebe somente o objeto de importação
      }
      catch (e) {
        log.error("Erro o invocar o método onstart. Strategy: {} ", layout["ds_strategykey"], e);
      }
    }

    // #Ajustando o formato da mascara - deixando o mês em maiusculo conforme formato do java
    if (dateformat) {
      dateformat = dateformat.toLowerCase().replaceAll("m", "M");
      formatDateLayout = new SimpleDateFormat(dateformat);
    }

    var line = "";
    var lineNumber = 1;

    if (layout["do_cabecalho"] == "Y") {
      lineNumber++;
    }

    
    //recuperando a entidade
    var entityname = layout["ds_entidadeprincipal"];  //DS_MAINOBJETOBD
    var entity = daoFactory.getDao("OBJETOBD").filter("ds_objetobd").equalsTo(entityname).findFirst();

    var dao;
    if (entity) {
      dao = daoFactory.getDao(entityname);
    }

    var pk;
    if (entityname) {
      pk = daoFactory.getDao(entityname).getEntity().getPrimaryKey().getName();
    }
    var to = {};
    var toUpdate = {};

    var myData = [];
    var sql = "";
    var filter = [];
    var ob = {};
    var campobd2 = {};

    if (entity) {
      daoFactory.getDao("CAMPOBD").filter("id_objetobd").equalsTo(entity["id_objetobd"]).includeFk(true).fetch(function (row) {
        campobd2[row["ds_campobd"]] = row;
      });
    }

    daoFactory.getDao("BRH_DATAIMP_IMPORTLOG").filter("id_brh_dataimp_importlog").equalsTo(importlogid).and("dt_inicio").isEmpty().update(importlog);

    var canExecute = true;
    var errorLoop = 0;

    for (var ri = 0; ri < rows.length; ri++) {
      if (errorLoop <= 30) { 
        try {
          to = {};
          var analisyFields = [];
          var haveRecord = false;
          var primarykeyid = null;
          
          var columns = rows[ri];

          // dessa forma pode ter no evento onrecord colunas que não são gravadas em banco de dados
          to.columns = columns;

          if (entity) {
            // verificando se possui algum campo que será utilizado como análise
            for (var i = 0; i < columns.length; i++) {
              var layoutfield = layoutfields[i];

              if (layoutfield["ds_campobd"] != null) {
                var campobd = campobd2[layoutfield["ds_campobd"]];
                var tpcampobd = {};
                if (campobd) {
                  tpcampobd["ds_tpcampobd"] = campobd["ds_tpcampobd"];
                  layoutfields[i]["tpcampobd"] = tpcampobd;
                  layoutfields[i]["campobd"] = campobd;
                }
              }

              layoutfields[i]["colvalue"] = columns[i];

              var colvalue = layoutfield["colvalue"]; // obtendo o valor do campo

              if (layoutfield["do_action"] != "G") {
                var tpcampobd = layoutfield["tpcampobd"];

                if (tpcampobd && (tpcampobd["ds_tpcampobd"].equals("Datetime") || tpcampobd["ds_tpcampobd"].equals("Date"))) {

                  if (colvalue != "") {

                    var formatField = layoutfield["ds_format"];
                    if (formatField == "null") { formatField = null; }

                    if (formatField != null) {

                      formatField = formatField.toLowerCase();
                      formatField = formatField.replaceAll("m", "M");

                      var formatDateLayoutField = new SimpleDateFormat(formatField);
                      colvalue = new SqlDate(formatDateLayoutField.parse(colvalue).getTime());
                    }
                    else if (dateformat) {
                      colvalue = new SqlDate(formatDateLayout.parse(colvalue).getTime());

                    }  // end if formatField != null

                  }// end if colvalue != ""

                }
                else if (tpcampobd && tpcampobd["ds_tpcampobd"].equals("Numeric")) {
                  //decimalseparator
                  colvalue = colvalue.replace(decimalseparator, ".");

                } // end if tpcampobd["ds_tpcampobd"].toString().equals("Datetime") ||

                //verificando se é somente números
                var onlynumbers = layoutfield["do_onlynumbers"];
                if (onlynumbers == "null") { onlynumbers = null; }

                if (onlynumbers == "Y") {
                  colvalue = colvalue.replaceAll("[^0-9]", "");
                }

                //tamanho do campo (Exception a parte)
                if (layoutfield["campobd"] && layoutfield["campobd"]["nr_tamanho"] != null && layoutfield["campobd"]["nr_tamanho"] > -1) {
                  // PO-4536 // if( layoutfield["campobd"]["nr_tamanho"] != null){
                  if (colvalue.length > layoutfield["campobd"]["nr_tamanho"]) {
                    throwTruncatedException(i, colvalue, entityname, layoutfield["ds_campobd"], layoutfield["campobd"]["nr_tamanho"]);
                  }
                }

                if (colvalue != "") {
                  to[layoutfield["ds_campobd"].toLowerCase()] = colvalue;

                  //PO-24784 | Juliana Braga | 25/09/2023
                  //Alt ini
                  if (layoutfield["do_action"] == "U") {
                    toUpdate[layoutfield["ds_campobd"].toLowerCase()] = colvalue;
                  }
                  //Alt fim 
                }

                //} // end of if haveRecord == true && layoutfield["do_action"] == "U") || ( haveR.... //PO-24784 | Juliana Braga | 25/09/2023

              } // end of if layoutfield["do_action"] != "G"

              if (layoutfield["do_analysis"] == "Y") {

                //analisyFields.push( layoutfield );
                //var colvalue = columns[ ( field["nr_sequence"] ) ];
                if (layoutfields[i]["tpcampobd"] != null) {

                  var colvalue = layoutfields[i]["colvalue"];
                  var tpcampobd = layoutfields[i]["tpcampobd"];
                  if (layoutfield["do_onlynumbers"] == "Y") {
                    colvalue = colvalue.replaceAll("[^0-9]", "");
                  }
                  if (tpcampobd && (tpcampobd.ds_tpcampobd == "Integer" || tpcampobd.ds_tpcampobd == "Numeric" || tpcampobd.ds_tpcampobd == "Long")) {
                    colvalue = colvalue;
                  } else {
                    colvalue = colvalue;
                  }
                  sql = "where";
                  ob[layoutfield["ds_campobd"]] = colvalue;

                  //filter.push(ob);
                }
              }

            } // for(var i = 0; i < columns.length; i++){

            if (sql != "") {
              sql = "select " + pk + " as val from " + entityname + " #CRITERIA# limit 1";


              var data = daoFactory.getDao(entityname).filter(ob).find(sql);

              if (data.size > 0) {
                haveRecord = true;
                primarykeyid = data[0].val;
              }
            }
          }

          // invoca o método onrecord
          if (strategySource && strategySource.hasOwnProperty('onrecord')) {
            //strategySource.onrecord( to, importto, lineNumber ); 

            //Se for Insert considerar o "to" se for Update considerar o "haveRecord" e "toUpdate"
            strategySource.onrecord(to, importto, lineNumber, toUpdate, haveRecord);
          }

          // caso o registro já exista será atualizado, caso o contrário será efetuado um insert
          //PO-24784 | Juliana Braga | 25/09/2023
          //Alt ini
          //if( haveRecord && layoutfield["do_action"] == 'U'){ 
          // ZAN | 2025-03-31
          // se quiser ignorar que o registro seja inserido pelo fluxo padrão, precisa retornar o ignore
          if (entity && !to.ignore) {
            if (haveRecord) {
              daoFactory.getDao(entityname).filter(pk).equalsTo(primarykeyid).update(toUpdate);

              to[pk] = primarykeyid;

              importlog["nr_duplicated"] = importlog["nr_duplicated"] + 1;
            }
            else {
              daoFactory.getDao(entityname).insert(to);

              to[pk] = to[pk.toLowerCase()];
            }
          }


          if (strategySource && strategySource.hasOwnProperty('afterset')) {
            strategySource.afterset(to);
          }

          importlog["nr_recordssuccess"] = importlog["nr_recordssuccess"] + 1;

          //importlog
          var importlogrecord = [];
          importlogrecord["id_pkmaintable"] = to[pk];
          importlogrecord["id_brh_dataimp_importlog"] = importlog["id_brh_dataimp_importlog"];
          daoFactory.getDao("BRH_DATAIMP_IMPORTLOGRECORDKEY").insert(importlogrecord);
          if (errorLoop != 0) {
            errorLoop = 0;
          }
        } catch (e) {

          var importlogerror = [];
          var error = e.cause;
          if (e.message) {
            if (e.cause && e.cause.message == "#notcount#") {
              error = e.message;
            } else {
              errorLoop++;
            }
          }
          importlogerror["id_brh_dataimp_importlog"] = importlog["id_brh_dataimp_importlog"];
          importlogerror["tx_erro"] = e.message || e.cause;
          importlogerror["tx_causa"] = error;
          importlogerror["tx_errolinha"] = to;
          importlogerror["nr_numerolinhaerro"] = lineNumber;

          countErro++;
          // invoca o método onerror [ caso exista ] 
          if (strategySource && strategySource.hasOwnProperty('onerror')) {
            try {
              strategySource.onerror(importlogerror, importto);
            }
            catch (e) {
              log.error("Erro o invocar o método onerror. estratégia: {} ", layout["ds_strategykey"], e);
            }
          }

          daoFactory.getDao("BRH_DATAIMP_IMPORTLOGERROR").insert(importlogerror);

          importlog["nr_falhas"] = importlog["nr_falhas"] + 1;

          logger.error("erro", e);
        }
        finally {
          importlog["nr_registros"] = importlog["nr_registros"] + 1;
        }

       
        var sleep = 60000;
        var somaSleep = 1000;
        var SleepActive = 'Y';

        if (SleepActive == 'Y') {
          if (lineNumber / divisor == 1) {
            Thread.sleep(sleep);
            divisor += somaSleep;
            daoFactory.getDao("BRH_DATAIMP_IMPORTLOG").update(importlog);
          }
        }

      }
        
      lineNumber++;
    }

    importlog["dt_fim"] = new Date();

    var difference = importlog["dt_fim"].getTime() - importlog["dt_inicio"].getTime();
    difference = difference != 0 ? difference / 1000 : difference;

    importlog["nr_decorrido"] = difference;

    // invoca o método onfinish [ caso exista ] 
    if (strategySource) {
      try {
        /*if(CampaignId > 0){
          importlog["id_campaign"] = CampaignId;
        }*/
        strategySource.onfinish(importlog);
      } catch (e) {
        logger.error("Erro o invocar o método onfinish. estratégia: {} ", layout["nr_sequencia"]);
      }
    }

    importlog['do_falhou'] = (importlog["nr_falhas"] && importlog["nr_falhas"] > 0) ? 'Y' : 'N';

    daoFactory.getDao("BRH_DATAIMP_IMPORTLOG").update(importlog);

    return { 'message': 'success' }
  }

  function formatSql(date) {
    return new SqlDate(date.getTime());
  }

  var CONST_DATAIMP_IMPORT = "BRH_DATAIMP_IMPORTACAO";
  var postImport = function (data) {

    CampaignId = 0;
    var file = data.file;
    if (data && data.campaign) {
      CampaignId = data.campaign;
    }

    if (file.id == null) {
      throw localization.translate("error.dataimp.empty.file");
    }

    var layout = saveLayout(data.layout);

    data.brh_dataimp_layoutId = layout.id;
    data.id = null;
    data.entidadeprincipal = layout.entidadeprincipal;
    data.chaveestrategica = layout.chaveestrategica;

    data = crmUtilsBusinessDelegate.defaultPostDataEncoded(data, CONST_DATAIMP_IMPORT);

    data.layout = layout;
    var importlog = createImportLog(data, file);

    daoFactory.getDao("brh_dataimp_schedimportlog").insert({ "ID_BRH_DATAIMP_IMPORTLOG": importlog["id_brh_dataimp_importlog"] });
    //Deixa comentado a linah abaixo
    //importData( importlog["id_brh_dataimp_importlog"] );

    return data;
  }

  function createImportLog(importto, file) {
    var to = new TO();
    to["dt_inicio"] = new Date();
    to["ID_BRH_DATAIMP_IMPORTACAO"] = importto["id"];
    to["ID_BRH_DATAIMP_LAYOUT"] = importto["brh_dataimp_layoutId"];
    to["ID_ARQUIVO_IMPORTACAO"] = file["id"];
    to["DO_WIZARD"] = importto["wizard"] || 'N';

    daoFactory.getDao("BRH_DATAIMP_IMPORTLOG").insert(to);

    return to;
  }

  function getBufferedReaderByFile(fileid) {
    var storedFile = new StoredFileBusinessDelegate(scriptContext).get(Number(fileid));
    var fileData = new StoredFileBusinessDelegate(scriptContext).doDownload(storedFile);
    /*var newFile = require("inpaas.core.files").read(fileid, function(index, line) {
          });*/

    //return new BufferedReader(new InputStreamReader(new ByteArrayInputStream(fileData.getData()), "UTF-8")); 
    return new BufferedReader(new InputStreamReader(new ByteArrayInputStream(fileData.getData()), "ISO-8859-1"));
  }


  var getRenderizeFile = function (fileid, brh_dataimp_layoutId) {
    var data = new ArrayList();

    var delimitador = ";";
    //var qualifier = "\"";
    var fieldqualification = null;
    var maxlength = 0;
    var hasheader = null;
    var layoutfields = [];

    if (brh_dataimp_layoutId != null) {
      var layout = daoFactory.getDao("BRH_DATAIMP_LAYOUT").filter("id_brh_dataimp_layout").equalsTo(brh_dataimp_layoutId).findFirst();
      delimitador = layout["do_delimitador"];
      if (!delimitador) { delimitador = ";" }

      //qualifier = layout["do_qualificarcampo"];
      fieldqualification = layout["do_qualificadorcampo"] == "D" ? "\"" : layout["do_qualificadorcampo"] == "S" ? "'" : null;
      hasheader = layout["do_cabecalho"];

      layoutfields = daoFactory.getDao("BRH_DATAIMP_LAYOUTFIELD").filter("id_brh_dataimp_layout").equalsTo(brh_dataimp_layoutId).sort({ "nr_sequencia": "ASC" }).find();
    }

    // recolhe os dados do arquivo
    var coreFile = daoFactory.getDao("CORE_FILE").filter("ID_FILE").equalsTo(fileid).find().first();

    var rows = [];

    if (['xls', 'xlsx'].indexOf(coreFile['ds_extension']) >= 0) {
      rows = require('plusoftcrm.libs.main.excel').toArray(fileid, { maxRows: 10 });
    } else {
      

      var bf = getBufferedReaderByFile(fileid);
      var line = "";
      var cont = 0;

      while ((line = bf.readLine()) != null && cont <= 10) {


        var array = getCollumns(fieldqualification, delimitador, line);
        rows.push(array);

        //var array = line.split( delimitador );
        cont++;
      }
    }

    for (var x = 0; x <= rows.length; x++) {
      var array = rows[x];

      if (array) {
        var row = new ArrayList();

        for (var i = 0; i < array.length; i++) {

          var col = {};
          col["descricao"] = array[i];
          col["description"] = array[i];

          if (x >= 1) { row.add(col); continue; }

          if (i < layoutfields.length) {

            //if( i == 0 ){  col["descricao"] = layoutfields[i].descricao;  }



            col["id_brh_dataimp_layoutfield"] = layoutfields[i].id_brh_dataimp_layoutfield;
            col["layoutfieldid"] = layoutfields[i].id_brh_dataimp_layoutfield;
            col["id_brh_dataimp_layout"] = layoutfields[i].id_brh_dataimp_layout;
            col["layoutid"] = layoutfields[i].id_brh_dataimp_layout;
            col["ds_objetonome"] = layoutfields[i].ds_objetonome;
            col["objetobdname"] = layoutfields[i].ds_objetonome;
            col["ds_campo"] = layoutfields[i].ds_campo;
            col["campobdname"] = layoutfields[i].ds_campo;
            col["do_analise"] = layoutfields[i].do_analise;
            col["analysis"] = layoutfields[i].do_analise;
            col["ds_formato"] = layoutfields[i].ds_formato;
            col["format"] = layoutfields[i].ds_formato;
            col["nr_posicaodelimitada"] = layoutfields[i].nr_posicaodelimitada;
            col["delimitedposition"] = layoutfields[i].nr_posicaodelimitada;
            col["nr_iniciofixado"] = layoutfields[i].nr_iniciofixado;
            col["fixedstart"] = layoutfields[i].nr_iniciofixado;
            col["nr_fimfixado"] = layoutfields[i].nr_fimfixado;
            col["fixedend"] = layoutfields[i].nr_fimfixado;
            col["do_acao"] = layoutfields[i].do_acao;
            col["action"] = layoutfields[i].do_acao;
            col["ds_chaveestrategica"] = layoutfields[i].ds_chaveestrategica;
            col["strategykey"] = layoutfields[i].ds_chaveestrategica;
            col["nr_sequencia"] = layoutfields[i].nr_sequencia;
            col["sequence"] = layoutfields[i].nr_sequencia;
            col["do_somentenumeros"] = layoutfields[i].do_somentenumeros;
            col["onlynumbers"] = layoutfields[i].do_somentenumeros;

            var entity = daoFactory.getDao("OBJETOBD").filter("ds_objetobd").equalsTo(layoutfields[i].ds_objetonome).findFirst();
            //var attributes = daoFactory.getDao("CAMPOBD").filter("id_objetobd").equalsTo( entity["id_objetobd"] ).find();

            if (entity) {
              entity["id_fk"] = entity["id_objetobd"];
              entity["ds_fk"] = entity["ds_objetobd"];
              entity["attributes"] = coreUtilsBusinessDelegate.getAttributesByEntity(parseInt(entity["id_objetobd"]));

              col["entity"] = entity;
            }

          }

          row.add(col);
        }

        data.add(row);
      }
    }

    return { data: data, hasheader: hasheader, maxlength: maxlength };
    //return data;
  }

  var saveLayout = function (data) {
    var rowlayoutfields = data.rowlayoutfields;

    if (data.delimitador == "O") { data.delimitador = data.anotherdelimiter }

    var layout = crmUtilsBusinessDelegate.defaultPostDataEncoded(data, "BRH_DATAIMP_LAYOUT");
    layout.rowlayoutfields = rowlayoutfields;
    if (rowlayoutfields) {
      if (rowlayoutfields.length > 0) {
        layout.rowlayoutfields[0].layoutfields = saveLayoutfields(rowlayoutfields[0].layoutfields, layout.id);
      }
    }

    return layout;
  }

  function saveLayoutfields(layoutfields, id_brh_dataimp_layout) {
    //logging.warn(layoutfields, id_brh_dataimp_layout, 'xxx');
    for (var i = 0; i < layoutfields.length; i++) {
      var lf = layoutfields[i];

      if (lf.layoutfieldid) {
        lf.id = lf.layoutfieldid;
      }
      
      lf.brh_dataimp_layoutId = id_brh_dataimp_layout;

      if (lf.objetobdname) {
        lf.objetonome = lf.objetobdname.ds_objetobd;
      }
      lf.campo = lf.campobdname;
      lf.analise = (lf.analysis == true) ? 'Y' : 'N';

      if (lf.existingrecord == true) {
        lf.acao = "U";
      }
      else {
        if (lf.action == "" || lf.action == null) { lf.action == false; }

        lf.acao = lf.action == true ? "I" : "G";
      }

      if (lf.somentenumeros == true) { lf.somentenumeros = "Y"; }
      else { lf.somentenumeros = "N"; }

      //sequencia
      if (lf.sequencia == null || lf.sequencia == "") { lf.sequencia = i; }


      //lf.format = lf.format.toString().replace("string:", "");
      lf.formato = ("" + lf.format).toString().replace("string:", "");


      lf = crmUtilsBusinessDelegate.defaultPostDataEncoded(lf, "BRH_DATAIMP_LAYOUTFIELD");
      // lf.objetonome = entity;

      layoutfields[i] = lf;
    }

    return layoutfields;
  }

  function getCollumns(fieldqualification, delimitador, line) {
    var columns = [];

    if (fieldqualification != null) {
      var fakeLine = line;

      var i = 0;

      while (fakeLine.length > 0) {
        var qualificatorIndex = fakeLine.indexOf(fieldqualification);
        var delimiterIndex = fakeLine.indexOf(delimitador);
        var column = "";

        if (qualificatorIndex == -1 && delimiterIndex == -1) {
          column = fakeLine.substring(0, fakeLine.length);
          fakeLine = "";
        }
        else if (qualificatorIndex < delimiterIndex) {

          //primeiro ponto e vírgula depois da segunda aspas duplas

          var firstQualificator = fakeLine.indexOf(fieldqualification);
          var secondQualificator = fakeLine.substring(firstQualificator + 1, fakeLine.length).indexOf(fieldqualification);
          var delimiterIndex = fakeLine.substring((firstQualificator + secondQualificator) + 1, fakeLine.length).indexOf(delimitador);

          if (delimiterIndex == -1) {
            column = fakeLine.substring(0, fakeLine.length);
            fakeLine = "";

          }
          else if (firstQualificator == -1 && secondQualificator == -1) {
            column = fakeLine.substring(0, delimiterIndex);
            fakeLine = fakeLine.substring(delimiterIndex + 1, fakeLine.length);

          }
          else if (firstQualificator > 0) {

            var indexFirstDelimiter = fakeLine.indexOf(delimitador);

            column = fakeLine.substring(0, indexFirstDelimiter);
            fakeLine = fakeLine.substring(indexFirstDelimiter + 1, fakeLine.length);
          }
          else {
            if (delimiterIndex == 0) { delimiterIndex = 1; }
            if (firstQualificator == 0) { firstQualificator = 1; }

            if (secondQualificator == 0) { secondQualificator = 1; }

            column = fakeLine.substring(0, firstQualificator + secondQualificator + delimiterIndex);
            fakeLine = fakeLine.substring(firstQualificator + secondQualificator + delimiterIndex + 1, fakeLine.length);

          }

        }
        else if (delimiterIndex > 0) {
          column = fakeLine.substring(0, delimiterIndex);
          fakeLine = fakeLine.substring(delimiterIndex + 1, fakeLine.length);
        }
        else {
          column = fakeLine;
          fakeLine = "";
        }

        if (column.indexOf(fieldqualification) == 0) {
          //log.error("qualification");

          //while( column.indexOf( fieldqualification ) > -1 ){
          column = column.replace(fieldqualification, "");
          column = column.replace(fieldqualification, "");
          //}
        }

        columns[i] = column;
        i++;

        if (i == 200) { fakeLine = ""; }
      }
    }
    else {
      columns = line.split(delimitador);
    }

    return columns;
  }

  /*
     *  0 = índice da coluna
      1 = length do valor no qual houve a tentativa de inserção
      2 = nome da tabela
      3 = atributo
      4 = tamanho do atributo
     */
  function throwTruncatedException(i, colvalue, entityname, field, fieldlength) {
    var message = localization.translate("error.database.truncate.data.details", i + 1, colvalue.length, entityname, field, fieldlength);

    log.error("message", message);

    var TruncatedException = Java.extend(Exception, {
      toString: function () {
        return message;
      }
    });


    throw new Exception("error.database.truncated.data", new TruncatedException());
  }

  function getFileById(importlogid) {
    var importlog = daoFactory.getDao("BRH_DATAIMP_IMPORTLOG").filter("id_brh_dataimp_importlog").equalsTo(importlogid).findFirst();
    var fileData = fileService.download(importlog["id_arquivo_importacao"]);

    return fileData;
  }
  var inativeLog = function (id) {
    return daoFactory.getDao('BRH_DATAIMP_IMPORTLOG').filter("id_brh_dataimp_importacao").equalsTo(id).update({ "do_inativo": "Y" });
  }

  scope['teste'] = function () {
    return src("dao").getDao("BRH_DATAIMP_IMPORTLOG").insert({
      "dt_inicio": "2021-10-27 09:14:36",
      "id_brh_dataimp_importacao": 35,
      "id_brh_dataimp_layout": 4,
      "id_arquivo_importacao": 1634
    })
  }
  scope["importData"] = importData;
  scope["renderizeFile"] = getRenderizeFile;
  scope["saveLayout"] = saveLayout;
  scope["postImport"] = postImport;
  scope["getFileById"] = getFileById;
  scope["inativeLog"] = inativeLog;

  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = scope;
  } //if

  return scope;


})({});