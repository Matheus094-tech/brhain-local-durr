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
  });

  function importFolha(data) {
    return src.require('businessImportFolha').importFolha(data);
  }


  RESTService.addEndpoint({ 'name': 'importfolha', 'method': 'POST', 'path': '/importfolha' }, importFolha);  
})();