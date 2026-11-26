import type { Employee } from './types'

/** Display title for each roster wire field (the camelCase keys of
    Employee, which the backend's changed-fields report names), in roster CSV
    column order. Every roster surface shows the same titles. */
export const EMPLOYEE_FIELD_TITLES: Readonly<Record<keyof Employee, string>> = {
  name: 'Name',
  employeeId: 'Employee ID',
  email: 'Email',
  designation: 'Designation',
  location: 'Location',
  org: 'Org',
  businessUnit: 'Business Unit',
  project: 'Current Account / Project',
  deliveryHead: 'Delivery Head',
  deliveryManager: 'Delivery Manager',
  businessPartner: 'Business Partner',
  reportingManager: 'Reporting Manager',
  status: 'Status',
  joiningDate: 'Date of Joining',
}
