import FormClient from "./form-client";
export default async function PublicFormPage({params}:{params:Promise<{token:string}>}){const{token}=await params;return <FormClient token={token}/>}
