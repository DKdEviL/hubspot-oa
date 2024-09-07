export type Call = {
  customerId: number;
  callId: string;
  startTimestamp: number;
  endTimestamp: number;
}

export type CallApiResponse = {
  callRecords: Call[];
}

export type CustomerData = Omit<Call, 'customerId' >

export type Result = {
  customerId: number;
  date: string;
  maxConcurrentCalls: number;
  timestamp: number;
  callIds: string[];
}
