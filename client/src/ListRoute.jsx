import { useDataQuery } from './dataCache.jsx'
import { getList } from './api/httpApi.js'
import ShoppingList from './ShoppingList.jsx'
import Trips from './Trips.jsx'

export default function ListRoute({ listId, editItem, onEditHandled, onBrowseCatalog, onBackToLists, onMutationPending, onReviewChange }) {
  const query = useDataQuery(`list:${listId}`, (signal) => getList(listId, { signal }))
  if (query.data?.completedTrip) return <Trips key={listId} initialTripId={listId} onExit={onBackToLists} onReviewChange={onReviewChange} />
  return <ShoppingList key={listId} listId={listId} active editItem={editItem} onEditHandled={onEditHandled} onBrowseCatalog={onBrowseCatalog} onBackToLists={onBackToLists} onMutationPending={onMutationPending} onReviewChange={onReviewChange} />
}
