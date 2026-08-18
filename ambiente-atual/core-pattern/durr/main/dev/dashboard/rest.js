/*
 * RESTDashboard
 * durr.main.dev.dashboard.rest
 * 
 */
(function() {
  'use strict';

  var logger = logging.withLogger('durr.main.dev.dashboard.rest');
  var src = require('plusoftcrm.libs.main.source')({
    'dashboardColaborador': 'durr.main.dev.dashboard.colaborador',
    'dashboardDependente': 'durr.main.dev.dashboard.dependente'
  });  
  
  /*****************************/
  /*         TITULAR           */
  function obterDadosColaboradores(params) {
    return src.require('dashboardColaborador').obterDados(params);
  }
 
  function obterOpcoesFiltroColaboradores() {
    return src.require('dashboardColaborador').obterOpcoesFiltro();
  }
 
  RESTService.addEndpoint({ 'name': 'obterDadosColaboradores', 'method': 'GET', 'path': '/obterDadosColaboradores' }, obterDadosColaboradores);
  RESTService.addEndpoint({ 'name': 'obterOpcoesFiltroColaboradores', 'method': 'GET', 'path': '/obterOpcoesFiltroColaboradores' }, obterOpcoesFiltroColaboradores);
  
  
  /*****************************/
  /*         DEPENDENTE        */
  function obterDadosDependentes(params) {
    return src.require('dashboardDependente').obterDados(params);
  }
 
  function obterOpcoesFiltroDependentes() {
    return src.require('dashboardDependente').obterOpcoesFiltro();
  }
 
  RESTService.addEndpoint({ 'name': 'obterDadosDependentes', 'method': 'GET', 'path': '/obterDadosDependentes' }, obterDadosDependentes);
  RESTService.addEndpoint({ 'name': 'obterOpcoesFiltroDependentes', 'method': 'GET', 'path': '/obterOpcoesFiltroDependentes' }, obterOpcoesFiltroDependentes);

})();