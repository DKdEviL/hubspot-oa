import fetch from 'node-fetch';
import { Call, CallApiResponse, CustomerData, Result } from './models/model';

const userKey = '820a90b21490b531377df1c78922';
const CALLS_DATA_URL = `https://candidate.hubteam.com/candidateTest/v3/problem/dataset?userKey=${userKey}`;
const POST_RESULTS_URL = `https://candidate.hubteam.com/candidateTest/v3/problem/result?userKey=${userKey}`;

// Helper function to format a timestamp into YYYY-MM-DD format
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toISOString().split('T')[0]; // Return YYYY-MM-DD format
};

const generateDayBounds = (dateStr: string): { startOfDay: number, endOfDay: number } => {
  const startOfDay = new Date(`${dateStr}T00:00:00Z`).getTime();
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`).getTime();
  return { startOfDay, endOfDay };
};

// Fetch call records from the given URL
const fetchCallRecords = async (url: string): Promise<CallApiResponse> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }
    const data =  await response.json() ;
    return data as CallApiResponse;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
};


const processCalls = (calls: Call[]): Record<number, Record<string, CustomerData[]>> => {
  const customerData: Record<number, Record<string, CustomerData[]>> = {};

  calls.forEach(({ customerId, callId, startTimestamp, endTimestamp }) => {
    const startDate = formatDate(startTimestamp);
    const endDate = formatDate(endTimestamp);

    if (!customerData[customerId]) customerData[customerId] = {};

    if (!customerData[customerId][startDate]) {
      customerData[customerId][startDate] = [];
    }
    customerData[customerId][startDate].push({ callId, startTimestamp, endTimestamp });

    if (endDate !== startDate) {
      if (!customerData[customerId][endDate]) {
        customerData[customerId][endDate] = [];
      }
      customerData[customerId][endDate].push({ callId, startTimestamp, endTimestamp });
    }
  });

  return customerData;
};


const calculateConcurrentCalls = (customerData: Record<number, Record<string, CustomerData[]>>): Result[] => {
  const results: Result[] = [];

  Object.keys(customerData).forEach(customerIdStr => {
    const customerId = parseInt(customerIdStr);

    Object.keys(customerData[customerId]).forEach(date => {
      const { startOfDay, endOfDay } = generateDayBounds(date);
      const callsForDay = customerData[customerId][date].filter(call =>
        call.startTimestamp < endOfDay && call.endTimestamp > startOfDay
      );

      const events = callsForDay.flatMap(call => [
        { time: call.startTimestamp, type: 'start' as const, callId: call.callId },
        { time: call.endTimestamp, type: 'end' as const, callId: call.callId }
      ]);

      events.sort((a, b) => a.time - b.time || (a.type === 'end' ? -1 : 1));

      const currentCalls = new Set<string>();
      let maxConcurrentCalls = 0;
      let peakTimestamp = 0;
      let peakCallIds: string[] = [];

      events.forEach(event => {
        if (event.type === 'start') {
          currentCalls.add(event.callId);
          if (currentCalls.size > maxConcurrentCalls) {
            maxConcurrentCalls = currentCalls.size;
            peakTimestamp = event.time;
            peakCallIds = [...currentCalls];
          }
        } else {
          currentCalls.delete(event.callId);
        }
      });

      if (maxConcurrentCalls > 0) {
        results.push({
          customerId,
          date,
          maxConcurrentCalls,
          timestamp: peakTimestamp,
          callIds: peakCallIds
        });
      }
    });
  });

  return results;
};

const postResults = async (url: string, results: Result[]): Promise<void> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results })
    });
    if (!response.ok) {
      throw new Error(`Failed to post results: ${response.statusText}`);
    }
    const result = await response.json();
    console.log('Results posted successfully:', result);
  } catch (error) {
    console.error('Error posting results:', error);
    throw error; 
  }
};

// Main function to process phone calls
const processPhoneCalls = async (): Promise<void> => {

  try {
    const calls: Call[] = await fetchCallRecords(CALLS_DATA_URL).then(data => data.callRecords);
    const customerData = processCalls(calls);
    const results = calculateConcurrentCalls(customerData);
    await postResults(POST_RESULTS_URL, results);
  } catch (error) {
    console.error('An error occurred:', error);
  }
};

processPhoneCalls();
