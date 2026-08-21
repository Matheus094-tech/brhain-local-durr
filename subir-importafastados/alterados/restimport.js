/*
 * RESTImport
 * durr.main.dev.integracao.restimport
 * 
 */
(function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.integracao.restimport'); 

  var src = require('plusoftcrm.libs.main.source')({
    'businessImportFolha': 'durr.main.dev.integracao.businessImportFolha',
    'businessImportAfastados': 'durr.main.dev.integracao.businessImportAfastados',
  });

  function importFolha(data) {
    return src.require('businessImportFolha').importFolha(data);
  }

  function importAfastados(data) {
    return src.require('businessImportAfastados').importAfastados(data);
  }


  RESTService.addEndpoint({ 'name': 'importfolha', 'method': 'POST', 'path': '/importfolha' }, importFolha);
  RESTService.addEndpoint({ 'name': 'importafastados', 'method': 'POST', 'path': '/importafastados' }, importAfastados);
})();