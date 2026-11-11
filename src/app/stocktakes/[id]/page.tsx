import OperationDraftEditor from "@/features/operations/components/operation-draft-editor";

export default async function EditStocktakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationDraftEditor operation="stocktake" operationId={id} />;
}
