/*
 * SchedulerAplicarElegibilidade
 * durr.main.dev.scheduler.aplicarelegibilidade
 * 
 */
module.exports = (function () {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.scheduler.aplicarelegibilidade');

  var src = require('plusoftcrm.libs.main.source')({
    'credentials': 'inpaas.core.user.credentials',
    'elegibilidadeFlex': 'durr.main.dev.business.elegibilidadeflex'
  });

  function aplicarElegibilidade(options) {
    logger.error('executado SchedulerAplicarElegibilidade', options);    
    
    aplicarElegibilidadeFlex();
    
  }
  
  function aplicarElegibilidadeFlex(){
    var elegibilidadeFlexPendente = src.require('knex')('BRH_ELEGIBILIDADE_HISTORICO')
    .select('ID_BRH_ELEGIBILIDADE_HISTORICO')
    .whereNull('ID_BRH_PLANO_ELEGIBILIDADE_FLEX')
    .findFirst();
    
    if (elegibilidadeFlexPendente){
      logger.error('elegibilidadeFlexPendente', elegibilidadeFlexPendente);
      src.require('elegibilidadeFlex').aplicarElegibilidadeFlex();
    }
  }

  return {
    'run': aplicarElegibilidade
  };

})();