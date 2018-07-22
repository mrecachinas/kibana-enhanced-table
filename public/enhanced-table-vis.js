import 'plugins/enhanced-table/enhanced-table-vis.less';
import 'plugins/enhanced-table/enhanced-table-vis-controller';
import 'plugins/enhanced-table/enhanced-table-vis-params';

import { VisVisTypeProvider } from 'ui/vis/vis_type';
import { TemplateVisTypeProvider } from 'ui/template_vis_type/template_vis_type';
import { VisSchemasProvider } from 'ui/vis/schemas';

import visTemplate from 'plugins/enhanced-table/enhanced-table-vis.html';
import paramsTemplate from 'plugins/enhanced-table/enhanced-table-vis-params.html';

import image from './images/icon-table.svg';

import { VisTypesRegistryProvider } from 'ui/registry/vis_types';

VisTypesRegistryProvider.register(EnhancedTableVisProvider);

function EnhancedTableVisProvider(Private) {
  const VisType = Private(VisVisTypeProvider);
  const TemplateVisType = Private(TemplateVisTypeProvider);
  const Schemas = Private(VisSchemasProvider);

  return new TemplateVisType({
    name: 'enhanced-table',
    title: 'Enhanced Table',
    image,
    description: 'Same functionality than Data Table, but with enhanced features like computed columns and filter bar.',
    category: VisType.CATEGORY.DATA,
    template: visTemplate,
    params: {
      defaults: {
        perPage: 10,
        showPartialRows: false,
        showMeticsAtAllLevels: false,
        sort: {
          columnIndex: null,
          direction: null
        },
        showTotal: false,
        totalFunc: 'sum',
        computedColumns: [],
        selectedRows: [],
        hideExportLinks: false,
        showFilterBar: false,
        showActions: false,
        showExtraActionTest: false,
        filterCaseSensitive: false,
        filterBarHideable: false,
        extraTextFieldname: "extraText",
        selectedRowsFieldname: "selectedRows",
        requestType: "POST",
        filterBarWidth: '25%'
      },
      editor: '<enhanced-table-vis-params></enhanced-table-vis-params>'
    },
    implementsRenderComplete: true,
    hierarchicalData: function (vis) {
      return Boolean(vis.params.showPartialRows || vis.params.showMeticsAtAllLevels);
    },
    schemas: new Schemas([
      {
        group: 'metrics',
        name: 'metric',
        title: 'Metric',
        aggFilter: '!geo_centroid',
        min: 1,
        defaults: [
          { type: 'count', schema: 'metric' }
        ]
      },
      {
        group: 'buckets',
        name: 'bucket',
        title: 'Split Rows'
      },
      {
        group: 'buckets',
        name: 'split',
        title: 'Split Table'
      }
    ])
  });
}

export default EnhancedTableVisProvider;
