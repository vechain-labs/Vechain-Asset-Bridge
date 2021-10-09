import path from "path";
import ActiveSupportServices from "./activeSupportService";
import ApiServer from "./apiServer";
import Environment from "./environment";
import NetworkHelper from "./utils/networkHelper";

process.setMaxListeners(50);

const configPath = path.join(__dirname, "../../../config/config_api.json");
let config = require(configPath);

let env:any;
env = new Environment(config);
env.entityPath = path.join(__dirname,"../common/model/entities/**.entity{.ts,.js}");

export let environment = env;

(new ActiveSupportServices()).activieSupportServices().then(action => {
    if(action.error != undefined){
        console.error("Support Active Faild: " + JSON.stringify(action.error));
        process.exit();
    }
    let port = environment.config.port;
    let app = new ApiServer(environment);
    app.listen(port);
    console.info(`${config.serviceName} active successful`);
    console.info(`Server run at:\r\n - Local: http://localhost:${port} \r\n - Network: http://${NetworkHelper.geIPAddress()}:${port}`);
}).catch(error => {
    console.error("Support Active Faild");
    process.exit();
});