import {
  AudienceType,
  UserDataFunctions,
} from '@microsoft/fabric-user-data-functions';

import {
  askAgent,
  getEmbedConfig,
  listAgents,
  listReports,
} from './handlers.js';

const functions = new UserDataFunctions('.');
const fabricToken = functions.connection({ audienceType: AudienceType.Fabric });

functions.func('listReports', listReports, [fabricToken]);
functions.func('listAgents', listAgents, [fabricToken]);
functions.func('getEmbedConfig', getEmbedConfig, [fabricToken]);
functions.func('askAgent', askAgent, [fabricToken]);
