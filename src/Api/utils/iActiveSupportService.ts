import { ActionResult } from "../../common/utils/components/actionResult";

export default interface IActiveSupportServices
{
    activieSupportServices(env:any):Promise<ActionResult>;
}