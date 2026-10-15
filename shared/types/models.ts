import type { Database } from './database.types'

export type TableName = keyof Database['public']['Tables']
export type Row<T extends TableName> = Database['public']['Tables'][T]['Row']
export type Insert<T extends TableName> = Database['public']['Tables'][T]['Insert']
export type Update<T extends TableName> = Database['public']['Tables'][T]['Update']

export type ProductWithBrand = Row<'products'> & { brand: Row<'brands'> }
