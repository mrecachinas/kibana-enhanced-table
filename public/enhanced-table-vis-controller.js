import { AggResponseTabifyProvider } from 'ui/agg_response/tabify/tabify';
import { RegistryFieldFormatsProvider } from 'ui/registry/field_formats';
import { uiModules } from 'ui/modules';
import _ from 'lodash';
import axios from 'axios';
import { VisAggConfigProvider } from 'ui/vis/agg_config';
import AggConfigResult from 'ui/vis/agg_config_result';
import { Parser } from 'expr-eval';
import handlebars from 'handlebars/dist/handlebars';

const module = uiModules.get('kibana/enhanced-table', ['kibana']);
module.controller('EnhancedTableVisController', function ($scope, $element, Private) {

  const tabifyAggResponse = Private(AggResponseTabifyProvider);
  const AggConfig = Private(VisAggConfigProvider);
  const fieldFormats = Private(RegistryFieldFormatsProvider);

  // controller methods

  const createExpressionParams = function (column, row) {
    let expressionParams = {};
    _.forEach(column.expressionParamsCols, function (expressionParamCol) {
      expressionParams[`col${expressionParamCol}`] = row[expressionParamCol].value;
    });
    return expressionParams;
  };

  const createParser = function (computedColumn) {
    let expression = computedColumn.formula.replace(/col\[(\d+)\]/g, 'col$1');
    return Parser.parse(expression);
  };

  const createCheckboxes = function(rows, column) {
    _.forEach(rows, function (row) {
      let parent = row.length > 0 && row[row.length-1];
      let value = '<input type="checkbox" />';
      let newCell = new AggConfigResult(column.aggConfig, parent, value, value);

      newCell.column = column;
      if (column.copyRowForTemplate) {
        newCell.row = _.clone(row);
      }
      newCell.toString = renderCell;
      row.push(newCell);
    });
  };

  const createCheckboxColumn = function () {
    const newColumn = {
      aggConfig: new AggConfig($scope.vis, {schema: 'metric', type: 'count'}),
      title: '<input type="checkbox" />',
      fieldFormatter: {},
      alignment: 'center',
      expressionParamsCols: [],
    };
    newColumn.aggConfig.id = `1.checkbox`;
    newColumn.aggConfig.key = `checkbox`;
    newColumn.template = handlebars.compile('<input type="checkbox" />');
    return newColumn;
  };

  const createColumn = function (computedColumn, index) {
    const FieldFormat = fieldFormats.getType(computedColumn.format);
    const fieldFormatParams = computedColumn.format === 'number' ? {pattern: computedColumn.pattern} : {};
    let newColumn = {
      aggConfig: new AggConfig($scope.vis, {schema: 'metric', type: 'count'}),
      title: computedColumn.label,
      fieldFormatter: new FieldFormat(fieldFormatParams),
      alignment: computedColumn.alignment,
      expressionParamsCols: []
    };
    newColumn.aggConfig.id = `1.computed-column-${index}`;
    newColumn.aggConfig.key = `computed-column-${index}`;
    let regex = /col\[?(\d+)\]?/g;
    let regexResult;
    while ((regexResult = regex.exec(computedColumn.formula)) !== null) {
      newColumn.expressionParamsCols.push(regexResult[1]);
    }
    if (computedColumn.applyTemplate && computedColumn.template !== undefined) {
      newColumn.template = handlebars.compile(computedColumn.template);
      newColumn.copyRowForTemplate = (computedColumn.template.indexOf('{{col.') != -1);
    }
    return newColumn;
  };

  const renderCell = function (contentType) {
    let result = this.column.fieldFormatter.convert(this.value);
    if (this.column.template !== undefined) {
      let context = { value: result, col: this.row };
      result = this.column.template(context);
    }
    if (this.column.alignment !== undefined && this.column.alignment !== 'left') {
      result = `<div align="${this.column.alignment}">${result}</div>`;
    }
    if (contentType !== 'html') {
      result = result.replace(/<(?:.|\n)*?>/gm, '');
    }
    return result;
  };

  const createComputedCells = function (column, rows, computedColumn, parser) {
    _.forEach(rows, function (row) {
      let expressionParams = createExpressionParams(column, row);
      let value = parser.evaluate(expressionParams);
      let parent = row.length > 0 && row[row.length-1];
      let newCell = new AggConfigResult(column.aggConfig, parent, value, value);
      newCell.column = column;
      if (column.copyRowForTemplate) {
        newCell.row = _.clone(row);
      }
      newCell.toString = renderCell;
      row.push(newCell);
    });
  };

  const createTables = function (tables, computedColumn, index, parser, newColumn) {
    _.forEach(tables, function (table) {
      if (table.tables) {
        createTables(table.tables, computedColumn, index, parser, newColumn, actionable);
        return;
      }

      table.columns.push(newColumn);
      createComputedCells(newColumn, table.rows, computedColumn, parser);
      createCheckboxes(table.rows);
    });
  };

  const hideColumns = function (tables, hiddenColumns) {
    _.forEach(tables, function (table) {
      if (table.tables) {
        hideColumns(table.tables, hiddenColumns);
        return;
      }

      let removedCounter = 0;
      _.forEach(hiddenColumns, function (item) {
        let index = item * 1;
        table.columns.splice(index - removedCounter, 1);
        _.forEach(table.rows, function (row) {
          row.splice(index - removedCounter, 1);
        });
        removedCounter++;
      });
    });
  };

  const shouldShowPagination = function (tables, perPage) {
    return tables.some(function (table) {
      if (table.tables) {
        return shouldShowPagination(table.tables, perPage);
      }
      else {
        return table.rows.length > perPage;
      }
    });
  };

  const filterTableRows = function (tables, activeFilter, filterCaseSensitive) {
    return _.filter(tables, function (table) {
      if (table.tables) {
        table.tables = filterTableRows(table.tables, activeFilter, filterCaseSensitive);
        return table.tables.length > 0;
      }
      else {
        if (!filterCaseSensitive) {
          activeFilter = activeFilter.toLowerCase();
        }
        table.rows = _.filter(table.rows, function (row) {
          return row.some(function (col) {
            let key = col.key;
            if (typeof key === 'string') {
              if (!filterCaseSensitive) {
                key = key.toLowerCase();
              }
              return key.includes(activeFilter);
            }
            return false;
          });
        });
        return table.rows.length > 0;
      }
    });
  };

  const sendRequest = function (httpType, url, data) {
    const normUrl = !url.startsWith("http") ? "http://" + url : url;
    return axios({
      method: httpType.toLowerCase(),
      url: normUrl,
      data: data,
    });
  };

  // filter scope methods
  $scope.doFilter = function () {
    $scope.activeFilter = $scope.vis.filterInput;
  };

  $scope.enableFilterInput = function () {
    $scope.filterInputEnabled = true;
  };

  $scope.disableFilterInput = function () {
    $scope.filterInputEnabled = false;
    $scope.activeFilter = $scope.vis.filterInput = '';
  };

  $scope.showFilterInput = function () {
    return !$scope.vis.params.filterBarHideable || $scope.filterInputEnabled;
  };

  // init controller state
  $scope.activeFilter = $scope.vis.filterInput = '';

  const uiStateSort = ($scope.uiState) ? $scope.uiState.get('vis.params.sort') : {};
  _.assign($scope.vis.params.sort, uiStateSort);

  $scope.sort = $scope.vis.params.sort;
  $scope.$watchCollection('sort', function (newSort) {
    $scope.uiState.set('vis.params.sort', newSort);
  });

  $scope.sendAllRows = function(extraText) {
    const extraTextFieldname = $scope.vis.params.extraTextFieldname;
    const selectedRowsFieldname = ($scope.vis.params.selectedRowsFieldname === "" ||
                                   $scope.vis.params.selectedRowsFieldname === undefined) ? 
                                   "selectedRows": $scope.vis.params.selectedRowsFieldname;
    const apiEndpoint = $scope.vis.params.apiEndpoint;
    const requestType = $scope.vis.params.requestType;
    const showExtraActionText = $scope.vis.params.showExtraActionText;

    const tables = $scope.tableGroups.tables;
    const postableColumnsString = $scope.vis.params.postableColumns;
    const postableColumnsStringArray = (postableColumnsString === undefined ||
                                        postableColumnsString === "") ? [] :
                                        postableColumnsString.split(',');
    const postableColumnsStringArrayNotEmpty = postableColumnsStringArray.filter(function(c) {
      return c !== "";
    });

    const postableColumns = postableColumnsStringArrayNotEmpty.map(function(c) {
      return parseInt(c);
    });

    const selectedRows = _.flatten(_.map(tables, function(table) {
      return _.map(table.rows, function(row) {
        const columnNames = _.map(table.columns, function(col) {
          return col.title;
        });

        let result = {};
        _.forEach(row, function(columnInRow, index) {
          const shouldAdd = (postableColumns === undefined || postableColumns.length === 0) ||
                            (postableColumns.indexOf(index) !== -1);

          if (shouldAdd) {
            result[columnNames[index]] = columnInRow.value;
          }
        });
        return result;
      });
    }));

    // TODO: Propagate error back to viz
    if ((extraText === undefined || extraText === "") && showExtraActionText) {
      $scope.message = `Error: Please enter text in text box below.`;
      $scope.error = true;
      return;
    }

    if (selectedRows.length === 0) {
      $scope.message = `Error: No rows to send.`;
      $scope.error = true;
      return;
    }

    if (apiEndpoint === undefined || apiEndpoint === "") {
      $scope.message = `Error: This component is misconfigured. Please add an API URL.`;
      $scope.error = true;
      return;
    }

    const request = {
      [selectedRowsFieldname]: selectedRows,
    };

    if (extraText !== undefined && extraText !== "") {
      request[extraTextFieldname] = extraText;
    }

    const response = sendRequest(requestType, apiEndpoint, request);
    response.then(function(res) {
      $scope.message = "Success!";
      $scope.error = false;
    }).catch(function(err) {
      $scope.message = `Error: ${err}`;
      $scope.error = true;
    });
  };

  /**
   * Recreate the entire table when:
   * - the underlying data changes (esResponse)
   * - one of the view options changes (vis.params)
   * - user submits a new filter to apply on results (activeFilter)
   */
  $scope.$watchMulti(['esResponse', 'vis.params', 'activeFilter'], function ([resp]) {
    $scope.error = false;
    $scope.message = "";
    let tableGroups = $scope.tableGroups = null;
    let hasSomeRows = $scope.hasSomeRows = null;

    if (resp) {
      const vis = $scope.vis;
      const params = vis.params;

      // compute tableGroups
      tableGroups = tabifyAggResponse(vis, resp, {
        partialRows: params.showPartialRows,
        minimalColumns: vis.isHierarchical() && !params.showMeticsAtAllLevels,
        asAggConfigResults: true
      });

      // process computed columns
      _.forEach(params.computedColumns, function (computedColumn, index) {
        if (computedColumn.enabled) {
          let parser = createParser(computedColumn);
          let newColumn = createColumn(computedColumn, index);
          createTables(tableGroups.tables, computedColumn, index, parser, newColumn);
        }
      });

      // process hidden columns
      if (params.hiddenColumns) {
        hideColumns(tableGroups.tables, params.hiddenColumns.split(','));
      }

      // process filter bar
      if (params.showFilterBar && $scope.showFilterInput() && $scope.activeFilter !== '') {
        tableGroups.tables = filterTableRows(tableGroups.tables, $scope.activeFilter, params.filterCaseSensitive);
      }

      // check if there are rows to display
      hasSomeRows = tableGroups.tables.some(function haveRows(table) {
        if (table.tables) {
          return table.tables.some(haveRows);
        }
        return table.rows.length > 0;
      });

      // optimize space under table
      const showPagination = hasSomeRows && params.perPage && shouldShowPagination(tableGroups.tables, params.perPage);
      $scope.tableVisContainerClass = {
        'hide-pagination': !showPagination,
        'hide-export-links': params.hideExportLinks
      };

      $element.trigger('renderComplete');
    }

    $scope.hasSomeRows = hasSomeRows;
    if (hasSomeRows) {
      $scope.tableGroups = tableGroups;
    }
  });
});
