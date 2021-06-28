export type Proposal = {
    hash:string;
    quorum:number;
    executed:boolean;
    value:string;
    signatures:Array<string>
}