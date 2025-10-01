#!/usr/bin/env python3
"""
Test suite for Karaoke Arcade
Validates core functionality and performance
"""

import os
import sys
import json
import time
import numpy as np
import soundfile as sf
from pathlib import Path

# Add python directory to path
sys.path.append(str(Path(__file__).parent / "python"))

def test_audio_analysis():
    """Test the audio analysis pipeline."""
    print("🧪 Testing Audio Analysis Pipeline")
    print("-" * 40)

    # Create a simple test signal
    sr = 22050
    duration = 10  # seconds
    t = np.linspace(0, duration, int(sr * duration))

    # Create a test signal with known properties
    # 440 Hz tone (A4) with some harmonics
    test_signal = (
        0.5 * np.sin(2 * np.pi * 440 * t) +  # Fundamental
        0.2 * np.sin(2 * np.pi * 880 * t) +  # Octave
        0.1 * np.sin(2 * np.pi * 1320 * t)   # Fifth
    )

    # Add some beats (120 BPM)
    beat_duration = 60 / 120
    beats = np.arange(0, duration, beat_duration)
    for beat in beats:
        beat_idx = int(beat * sr)
        if beat_idx < len(test_signal):
            test_signal[beat_idx:beat_idx+int(0.1*sr)] += 0.3

    # Save test signal
    test_file = Path("test_signal.wav")
    sf.write(test_file, test_signal, sr)

    try:
        # Import and test analysis
        from analyze import extract_enhanced_features

        start_time = time.time()
        reference = extract_enhanced_features(str(test_file), "test_reference.json")
        analysis_time = time.time() - start_time

        print(f"✅ Analysis completed in {analysis_time:.2f}s")
        print(f"   Duration: {reference['duration']:.1f}s")
        print(f"   Tempo: {reference['tempo']:.1f} BPM")
        print(f"   Key: {reference['key']}")
        print(f"   Phrases: {len(reference['phrases'])}")
        print(f"   Pitch samples: {len(reference['refPitchHz'])}")

        # Validate results
        assert abs(reference['tempo'] - 120) < 10, f"Tempo detection failed: {reference['tempo']}"
        assert len(reference['phrases']) > 0, "No phrases detected"
        assert len(reference['refPitchHz']) > 0, "No pitch data"

        print("✅ All analysis tests passed")

    except Exception as e:
        print(f"❌ Analysis test failed: {e}")
        return False
    finally:
        # Cleanup
        if test_file.exists():
            test_file.unlink()
        if Path("test_reference.json").exists():
            Path("test_reference.json").unlink()

    return True

def test_scoring_algorithms():
    """Test the scoring algorithms."""
    print("\n🎯 Testing Scoring Algorithms")
    print("-" * 40)

    # Test pitch scoring
    ref_pitch = 440.0  # A4
    test_pitches = [440.0, 441.0, 450.0, 500.0, 0.0]  # Perfect, close, off, way off, silent

    for test_pitch in test_pitches:
        if test_pitch == 0:
            score = 0
        else:
            pitch_error = abs(test_pitch - ref_pitch) / ref_pitch
            score = max(0, 1 - pitch_error * 2)

        print(f"   Pitch {test_pitch}Hz -> Score: {score:.2f}")

    # Test rhythm scoring
    beat_times = [0.0, 0.5, 1.0, 1.5, 2.0]  # 120 BPM
    test_times = [0.0, 0.4, 0.6, 1.1, 1.9]

    for test_time in test_times:
        # Find closest beat
        closest_beat = min(beat_times, key=lambda x: abs(x - test_time))
        timing_error = abs(test_time - closest_beat)

        if timing_error < 0.1:  # Within tolerance
            score = 1.0
        else:
            score = max(0, 1 - timing_error * 5)

        print(f"   Time {test_time}s -> Score: {score:.2f}")

    print("✅ Scoring algorithm tests completed")
    return True

def test_performance():
    """Test performance benchmarks."""
    print("\n⚡ Testing Performance")
    print("-" * 40)

    # Test analysis speed with different file sizes
    durations = [10, 30, 60]  # seconds

    for duration in durations:
        print(f"\n📊 Testing {duration}s audio file...")

        # Create test signal
        sr = 22050
        t = np.linspace(0, duration, int(sr * duration))
        test_signal = np.sin(2 * np.pi * 440 * t)

        test_file = Path(f"perf_test_{duration}s.wav")
        sf.write(test_file, test_signal, sr)

        try:
            from analyze import extract_enhanced_features

            start_time = time.time()
            reference = extract_enhanced_features(str(test_file), f"perf_ref_{duration}s.json")
            analysis_time = time.time() - start_time

            print(f"   Analysis time: {analysis_time:.2f}s")
            print(f"   Speed ratio: {duration/analysis_time:.1f}x real-time")

            # Performance should be at least 2x real-time
            assert duration/analysis_time >= 2.0, f"Performance too slow: {duration/analysis_time:.1f}x"

        except Exception as e:
            print(f"   ❌ Performance test failed: {e}")
            return False
        finally:
            # Cleanup
            if test_file.exists():
                test_file.unlink()
            if Path(f"perf_ref_{duration}s.json").exists():
                Path(f"perf_ref_{duration}s.json").unlink()

    print("✅ Performance tests passed")
    return True

def test_data_structures():
    """Test JSON schema compliance."""
    print("\n📋 Testing Data Structures")
    print("-" * 40)

    # Create a minimal reference data structure
    reference_data = {
        "beats": [0.0, 0.5, 1.0, 1.5],
        "downbeats": [120.0],
        "phrases": [
            {"start": 0.0, "end": 2.0},
            {"start": 2.0, "end": 4.0}
        ],
        "refPitchHz": [440.0, 440.0, 440.0, 440.0],
        "key": "A major",
        "keyConfidence": 0.8,
        "sections": [
            {"start": 0.0, "label": "intro"},
            {"start": 2.0, "label": "verse"}
        ],
        "loudness": [0.5, 0.6, 0.7, 0.8],
        "tempo": 120.0,
        "duration": 4.0,
        "sampleRate": 22050,
        "hopLength": 512,
        "confidence": [0.9, 0.9, 0.9, 0.9]
    }

    # Test JSON serialization
    try:
        json_str = json.dumps(reference_data)
        parsed_data = json.loads(json_str)

        assert parsed_data["tempo"] == 120.0
        assert len(parsed_data["phrases"]) == 2
        assert parsed_data["phrases"][0]["start"] == 0.0

        print("✅ JSON serialization/deserialization works")

    except Exception as e:
        print(f"❌ Data structure test failed: {e}")
        return False

    # Test schema validation (basic checks)
    required_fields = ["beats", "phrases", "refPitchHz", "tempo", "duration"]
    for field in required_fields:
        assert field in reference_data, f"Missing required field: {field}"

    print("✅ Schema validation passed")
    return True

def test_edge_cases():
    """Test edge cases and error handling."""
    print("\n🔍 Testing Edge Cases")
    print("-" * 40)

    # Test with very short audio
    sr = 22050
    short_signal = np.sin(2 * np.pi * 440 * np.linspace(0, 0.1, int(sr * 0.1)))
    short_file = Path("short_test.wav")
    sf.write(short_file, short_signal, sr)

    try:
        from analyze import extract_enhanced_features
        reference = extract_enhanced_features(str(short_file), "short_ref.json")

        # Should handle short audio gracefully
        assert reference["duration"] > 0
        print("✅ Short audio handled correctly")

    except Exception as e:
        print(f"❌ Short audio test failed: {e}")
        return False
    finally:
        if short_file.exists():
            short_file.unlink()
        if Path("short_ref.json").exists():
            Path("short_ref.json").unlink()

    # Test with silent audio
    silent_signal = np.zeros(int(sr * 2))
    silent_file = Path("silent_test.wav")
    sf.write(silent_file, silent_signal, sr)

    try:
        from analyze import extract_enhanced_features
        reference = extract_enhanced_features(str(silent_file), "silent_ref.json")

        # Should handle silent audio gracefully
        assert reference["duration"] == 2.0
        print("✅ Silent audio handled correctly")

    except Exception as e:
        print(f"❌ Silent audio test failed: {e}")
        return False
    finally:
        if silent_file.exists():
            silent_file.unlink()
        if Path("silent_ref.json").exists():
            Path("silent_ref.json").unlink()

    print("✅ Edge case tests passed")
    return True

def run_all_tests():
    """Run all tests."""
    print("🎤 Karaoke Arcade Test Suite")
    print("=" * 50)

    tests = [
        test_data_structures,
        test_scoring_algorithms,
        test_audio_analysis,
        test_performance,
        test_edge_cases
    ]

    passed = 0
    total = len(tests)

    for test in tests:
        try:
            if test():
                passed += 1
        except Exception as e:
            print(f"❌ Test {test.__name__} failed with exception: {e}")

    print(f"\n📊 Test Results: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All tests passed! The system is ready for demo.")
        return True
    else:
        print("⚠️  Some tests failed. Please check the issues above.")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
